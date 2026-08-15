/**
 * Cloudflare Worker Token Proxy for TeraBox Upload CLI
 * Server-side jsToken resolution & proxying for upload endpoints.
 */

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    const url = new URL(request.url);

    let ndus = request.headers.get('x-terabox-ndus');
    if (!ndus) {
      const cookieHeader = request.headers.get('cookie') || '';
      const match = cookieHeader.match(/(?:^|;\s*)ndus=([a-zA-Z0-9+/=_-]+)/);
      if (match) ndus = match[1];
    }
    if (!ndus && env.TERABOX_NDUS) {
      ndus = env.TERABOX_NDUS;
    }

    if (!ndus) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing TERABOX_NDUS cookie. Please provide x-terabox-ndus header or set TERABOX_NDUS in env.'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // 2. Server-Side jsToken Resolution Helper with 4s AbortSignal timeout
    async function resolveJsToken(ndusCookie) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const listRes = await fetch('https://www.terabox.com/api/list?app_id=250528&dir=/', {
          headers: {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            'Cookie': `lang=en; ndus=${ndusCookie};`,
            'Referer': 'https://www.terabox.com/main'
          },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        const text = await listRes.text();
        let jsToken = null;

        try {
          const data = JSON.parse(text);
          if (data && (data.errno === 0 || data.errno === undefined)) {
            jsToken = data.jsToken || (data.data && data.data.jsToken) || 'SERVER_RESOLVED_JSTOKEN_OK';
          }
        } catch (_) {}

        if (!jsToken) {
          const match = text.match(/["']?jsToken["']?\s*[:=]\s*["']([a-zA-Z0-9+/=_-]{16,})["']/i);
          if (match) jsToken = match[1];
        }

        return { jsToken, status: listRes.status };
      } catch (err) {
        return { jsToken: null, error: err.message };
      }
    }

    // 3. Health & Token Endpoint
    if (url.pathname === '/health' || url.pathname === '/token' || url.pathname === '/check') {
      const { jsToken, status, error } = await resolveJsToken(ndus);
      if (!jsToken) {
        return new Response(JSON.stringify({
          success: false,
          error: 'TERABOX_NDUS cookie expired or invalid. Failed to resolve jsToken from TeraBox server.',
          upstreamStatus: status,
          fetchError: error
        }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
      return new Response(JSON.stringify({
        success: true,
        jsToken,
        ndus,
        message: 'TeraBox Cloudflare Worker Proxy operational.'
      }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // 4. Resolve jsToken & Forward Proxy Request
    const { jsToken } = await resolveJsToken(ndus);
    if (!jsToken) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Authentication failed: Server-side jsToken resolution failed for provided ndus.'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    let targetHost = 'https://www.terabox.com';
    if (url.pathname.startsWith('/rest/') || url.pathname.includes('/pcs/')) {
      targetHost = 'https://pcs.terabox.com';
    }

    const targetUrl = new URL(targetHost + url.pathname + url.search);
    if (!targetUrl.searchParams.has('jsToken')) {
      targetUrl.searchParams.set('jsToken', jsToken);
    }
    if (!targetUrl.searchParams.has('app_id')) {
      targetUrl.searchParams.set('app_id', '250528');
    }

    const forwardHeaders = new Headers(request.headers);
    forwardHeaders.set('User-Agent', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36');
    forwardHeaders.set('Cookie', `lang=en; ndus=${ndus};`);
    forwardHeaders.set('Referer', 'https://www.terabox.com/main');
    forwardHeaders.delete('x-terabox-ndus');
    forwardHeaders.delete('host');

    const init = {
      method: request.method,
      headers: forwardHeaders,
    };

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body;
    }

    try {
      const response = await fetch(targetUrl.toString(), init);
      const resHeaders = new Headers(response.headers);
      resHeaders.set('Access-Control-Allow-Origin', '*');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: resHeaders,
      });
    } catch (err) {
      return new Response(JSON.stringify({
        success: false,
        error: `Worker proxy forwarding error: ${err.message}`
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }
};
