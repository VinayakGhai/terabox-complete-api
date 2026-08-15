const http = require('http');
const url = require('url');

/**
 * Local Dynamic Mock TeraBox HTTP/HTTPS Server
 * Simulates TeraBox Web Portal, Passport Login, REST APIs, and upload endpoints.
 */
class MockTeraBoxServer {
  static activeServers = new Set();
  static hooksInstalled = false;

  static installExitHooks() {
    if (MockTeraBoxServer.hooksInstalled) return;
    MockTeraBoxServer.hooksInstalled = true;

    const stopAllSync = () => {
      for (const serverInstance of MockTeraBoxServer.activeServers) {
        try {
          if (serverInstance.server) {
            serverInstance.server.close();
          }
        } catch (_) {}
      }
      MockTeraBoxServer.activeServers.clear();
    };

    process.on('exit', stopAllSync);
    process.on('SIGINT', () => {
      stopAllSync();
      process.exit(130);
    });
    process.on('SIGTERM', () => {
      stopAllSync();
      process.exit(143);
    });
  }

  /**
   * @param {Object} [options={}]
   */
  constructor(options = {}) {
    MockTeraBoxServer.installExitHooks();
    this.options = options;
    this.server = null;
    this.port = 0;
    this.baseUrl = '';
    this.scenario = options.initialScenario || 'healthy';
    this.requests = [];
    this.customHandlers = new Map();
    this.delayMs = options.delayMs || 0;
    this.mockJsToken = options.jsToken || 'MOCK_JSTOKEN_' + Math.random().toString(36).slice(2, 12).toUpperCase();
    this.mockNdus = options.ndus || 'MOCK_NDUS_' + Math.random().toString(36).slice(2, 12);
    this.appId = options.appId || '250528';
  }

  /**
   * Starts the mock server on 127.0.0.1:0 (ephemeral port).
   * @returns {Promise<{ url: string, port: number }>}
   */
  async start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        const parsedUrl = url.parse(req.url, true);

        // Read request body if present
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
          const reqRecord = {
            method: req.method,
            url: req.url,
            pathname: parsedUrl.pathname,
            query: parsedUrl.query,
            headers: req.headers,
            body,
            timestamp: Date.now(),
          };
          this.requests.push(reqRecord);

          if (this.delayMs > 0) {
            await new Promise(r => setTimeout(r, this.delayMs));
          }

          // Handle CORS
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', '*');
          res.setHeader('Access-Control-Allow-Credentials', 'true');

          if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
          }

          // Check custom handlers first
          if (this.customHandlers.has(parsedUrl.pathname)) {
            const handler = this.customHandlers.get(parsedUrl.pathname);
            try {
              handler(reqRecord, res);
            } catch (e) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ errno: 500, errmsg: e.message }));
            }
            return;
          }

          this.handleScenarioRequest(parsedUrl, reqRecord, res);
        });
      });

      this.server.listen(0, '127.0.0.1', () => {
        this.port = this.server.address().port;
        this.baseUrl = `http://127.0.0.1:${this.port}`;
        MockTeraBoxServer.activeServers.add(this);
        resolve({
          url: this.baseUrl,
          port: this.port,
        });
      });

      this.server.on('error', reject);
    });
  }

  /**
   * Internal router based on current scenario.
   */
  handleScenarioRequest(parsedUrl, reqRecord, res) {
    const pathname = parsedUrl.pathname;

    // SCENARIO 1: login_redirect
    if (this.scenario === 'login_redirect') {
      if (pathname.startsWith('/api/') || pathname.includes('/list') || pathname.includes('/filelist')) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errno: -6, errmsg: 'auth failed: login required', success: false }));
        return;
      }
      if (pathname === '/' || pathname === '/main') {
        res.writeHead(302, {
          Location: `/login?redirect=${encodeURIComponent(reqRecord.url)}`,
          'Set-Cookie': 'session_state=unauthenticated; Path=/',
        });
        res.end();
        return;
      }
      if (pathname === '/login' || pathname === '/passport/login') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>TeraBox - Log In</title></head>
            <body>
              <div class="passport-login-container" id="login-container">
                <h2>Log In to TeraBox</h2>
                <form id="passport-login-form">
                  <input type="text" name="userName" placeholder="Email / Username" />
                  <input type="password" name="password" placeholder="Password" />
                  <button type="submit" id="login-submit-btn">Log In</button>
                </form>
              </div>
            </body>
          </html>
        `);
        return;
      }
    }

    // SCENARIO 2: login_form_on_main (no redirect, but login DOM present on /main)
    if (this.scenario === 'login_form_on_main') {
      if (pathname === '/' || pathname === '/main') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>TeraBox Portal</title></head>
            <body>
              <div class="passport-login-container">
                <div class="login-panel">
                  <input type="password" name="pwd" placeholder="Password" />
                  <button type="submit">Sign In</button>
                </div>
              </div>
            </body>
          </html>
        `);
        return;
      }
    }

    // SCENARIO 3: server_error
    if (this.scenario === 'server_error') {
      if (pathname.startsWith('/api/')) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body>500 Internal Server Error</body></html>');
        return;
      }
    }

    // SCENARIO 4: expired_auth
    if (this.scenario === 'expired_auth') {
      if (pathname.startsWith('/api/') || pathname.includes('/list') || pathname.includes('/filelist')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          errno: -6,
          errmsg: 'auth failed: expired token',
          success: false,
          message: 'Invalid or expired token',
        }));
        return;
      }
    }

    // DEFAULT / HEALTHY SCENARIO: Main dashboard page
    if (pathname === '/' || pathname === '/main') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Set-Cookie': `ndus=${this.mockNdus}; Path=/; Domain=127.0.0.1; HttpOnly; SameSite=Lax`,
      });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>TeraBox Dashboard</title>
            <script>
              window.jsToken = "${this.mockJsToken}";
              window.yunData = {
                jsToken: "${this.mockJsToken}",
                loginstate: 1,
                user: { id: "10001", name: "terabox_tester" }
              };
            </script>
          </head>
          <body>
            <div id="app">
              <div class="user-profile">Logged in as tester</div>
              <div class="file-manager">File Manager Active</div>
            </div>
            <script>
              // Trigger background fetch to emulate TeraBox frontend XHR
              fetch('/api/list?app_id=${this.appId}&web=1&channel=dubox&jsToken=${this.mockJsToken}').catch(function(){});
            </script>
          </body>
        </html>
      `);
      return;
    }

    // API: /api/list
    if (pathname.startsWith('/api/list') || pathname === '/api/list') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        errno: 0,
        errmsg: 'ok',
        success: true,
        guid: 'auto_guid_123',
        request_id: 1001,
        jsToken: this.mockJsToken,
        list: [
          { server_filename: 'sample.txt', size: 1024, fs_id: '12345', isdir: 0 },
        ],
      }));
      return;
    }

    // API: /api/home/info
    if (pathname.startsWith('/api/home/info') || pathname === '/api/home/info') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        errno: 0,
        errmsg: 'ok',
        success: true,
        data: {
          user_id: 998877,
          jsToken: this.mockJsToken,
        },
        jsToken: this.mockJsToken,
      }));
      return;
    }

    // Upload & file list verification endpoints (for TeraboxUploader)
    if (pathname.includes('/filelist') || pathname.includes('/file/list') || pathname === '/api/filelist') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        errno: 0,
        errmsg: 'ok',
        success: true,
        list: [],
      }));
      return;
    }

    // Upload mock endpoints (precreate, upload chunk, create)
    if (pathname.includes('/upload') || pathname.includes('/precreate') || pathname.includes('/create')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        errno: 0,
        errmsg: 'ok',
        success: true,
        uploadid: 'mock_upload_id_123',
        md5: 'e10adc3949ba59abbe56e057f20f883e',
        path: reqRecord.query?.path || '/mock_uploaded_file',
      }));
      return;
    }

    // Fallback 200 OK
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', errno: 0, jsToken: this.mockJsToken }));
  }

  /**
   * Registers a custom handler for a specific pathname.
   * @param {string} pathname
   * @param {Function} handler
   */
  registerRoute(pathname, handler) {
    this.customHandlers.set(pathname, handler);
  }

  /**
   * Sets server scenario.
   * @param {'healthy'|'login_redirect'|'login_form_on_main'|'expired_auth'|'server_error'|'custom'} scenario
   */
  setScenario(scenario) {
    this.scenario = scenario;
  }

  /**
   * Sets the ndus cookie and jsToken returned by mock responses.
   * @param {string} ndus
   * @param {string} [jsToken]
   */
  setCredentials(ndus, jsToken) {
    if (ndus) this.mockNdus = ndus;
    if (jsToken) this.mockJsToken = jsToken;
  }

  /**
   * Sets the jsToken returned by mock responses.
   * @param {string} token
   */
  setToken(token) {
    this.mockJsToken = token;
  }

  /**
   * Sets the ndus cookie returned by mock responses.
   * @param {string} ndus
   */
  setNdus(ndus) {
    this.mockNdus = ndus;
  }

  /**
   * Returns recorded request list.
   * @returns {Array<Object>}
   */
  getRequests() {
    return [...this.requests];
  }

  /**
   * Clears recorded requests.
   */
  clearRequests() {
    this.requests = [];
  }

  /**
   * Stops the server.
   * @returns {Promise<void>}
   */
  async stop() {
    return new Promise(resolve => {
      MockTeraBoxServer.activeServers.delete(this);
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}

/**
 * Scoped Execution Helper for Mock Server
 * @template T
 * @param {Object|((server: MockTeraBoxServer, info: { url: string, port: number }) => Promise<T>)} options
 * @param {((server: MockTeraBoxServer, info: { url: string, port: number }) => Promise<T>)} [fn]
 * @returns {Promise<T>}
 */
async function withMockServer(options, fn) {
  if (typeof options === 'function') {
    fn = options;
    options = {};
  }
  const server = new MockTeraBoxServer(options);
  const { url, port } = await server.start();
  try {
    return await fn(server, { url, port });
  } finally {
    await server.stop();
  }
}

module.exports = { MockTeraBoxServer, withMockServer };
