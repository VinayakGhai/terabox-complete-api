const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Hermetic Ephemeral Test Sandbox Manager
 * Provides isolated directories, environment variables, .env management, and guaranteed cleanup.
 */
class TestSandbox {
  static activeSandboxes = new Set();
  static hooksInstalled = false;

  static installExitHooks() {
    if (TestSandbox.hooksInstalled) return;
    TestSandbox.hooksInstalled = true;

    const cleanupAllSync = () => {
      for (const sandboxDir of TestSandbox.activeSandboxes) {
        try {
          if (fs.existsSync(sandboxDir)) {
            try {
              fs.chmodSync(sandboxDir, 0o777);
            } catch (_) {}
            fs.rmSync(sandboxDir, { recursive: true, force: true });
          }
        } catch (_) {}
      }
      TestSandbox.activeSandboxes.clear();
    };

    process.on('exit', cleanupAllSync);
    process.on('SIGINT', () => {
      cleanupAllSync();
      process.exit(130);
    });
    process.on('SIGTERM', () => {
      cleanupAllSync();
      process.exit(143);
    });
    process.on('uncaughtException', (err) => {
      cleanupAllSync();
      console.error('Uncaught Exception in sandbox runner:', err);
      process.exit(1);
    });
  }

  /**
   * @param {string} [name='default'] - Identifying name for the sandbox
   * @param {Object} [options={}] - Configuration options
   */
  constructor(name = 'default', options = {}) {
    TestSandbox.installExitHooks();
    this.name = name;
    this.options = options;
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const timestamp = Date.now();
    this.sandboxDir = path.join(os.tmpdir(), `tb_test_${name}_${timestamp}_${randomSuffix}`);
    this.virtualHome = path.join(this.sandboxDir, 'virtual_home');
    this.rootDir = path.resolve(__dirname, '../../');
    this.initialized = false;
  }

  /**
   * Initializes the sandbox directory, virtual HOME, and copies target scripts.
   * @returns {Promise<string>} Sandbox directory path
   */
  async init() {
    fs.mkdirSync(this.sandboxDir, { recursive: true });
    fs.mkdirSync(this.virtualHome, { recursive: true });
    TestSandbox.activeSandboxes.add(this.sandboxDir);

    // Copy genuine project files into sandbox
    const filesToCopy = ['upload.js', 'refresh_creds.js', 'package.json', 'README.md', '.env.example'];
    for (const file of filesToCopy) {
      const src = path.join(this.rootDir, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(this.sandboxDir, file));
      }
    }

    // Link node_modules so dependencies (e.g. dotenv, axios, playwright, terabox-upload-tool) resolve
    const nodeModulesSrc = path.join(this.rootDir, 'node_modules');
    const nodeModulesDest = path.join(this.sandboxDir, 'node_modules');
    if (fs.existsSync(nodeModulesSrc) && !fs.existsSync(nodeModulesDest)) {
      try {
        fs.symlinkSync(nodeModulesSrc, nodeModulesDest, 'junction');
      } catch (err) {
        // Fallback: NODE_PATH will be provided in getEnvVars()
      }
    }

    this.initialized = true;
    return this.sandboxDir;
  }

  /**
   * Seeds the sandbox .env file with given content string or key-value object.
   * @param {string|Object} contentOrObject
   */
  async seedEnv(contentOrObject) {
    let content = '';
    if (typeof contentOrObject === 'string') {
      content = contentOrObject;
    } else if (typeof contentOrObject === 'object' && contentOrObject !== null) {
      content = Object.entries(contentOrObject)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n') + '\n';
    }
    const envPath = path.join(this.sandboxDir, '.env');
    fs.writeFileSync(envPath, content, 'utf8');
  }

  /**
   * Reads raw .env file string from the sandbox.
   * @returns {Promise<string>}
   */
  async readEnv() {
    const envPath = path.join(this.sandboxDir, '.env');
    if (!fs.existsSync(envPath)) return '';
    return fs.readFileSync(envPath, 'utf8');
  }

  /**
   * Parses the sandbox .env file into key-value map.
   * @returns {Promise<Record<string, string>>}
   */
  async parseEnv() {
    const raw = await this.readEnv();
    const result = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        result[key] = val;
      }
    }
    return result;
  }

  /**
   * Writes an arbitrary file in the sandbox.
   * @param {string} relativeOrAbsPath
   * @param {string|Buffer} content
   * @returns {Promise<string>} Full path of the written file
   */
  async writeTestFile(relativeOrAbsPath, content) {
    const fullPath = path.isAbsolute(relativeOrAbsPath)
      ? relativeOrAbsPath
      : path.join(this.sandboxDir, relativeOrAbsPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
    return fullPath;
  }

  /**
   * Reads an arbitrary file from the sandbox.
   * @param {string} relativeOrAbsPath
   * @returns {Promise<string>}
   */
  async readTestFile(relativeOrAbsPath) {
    const fullPath = path.isAbsolute(relativeOrAbsPath)
      ? relativeOrAbsPath
      : path.join(this.sandboxDir, relativeOrAbsPath);
    if (!fs.existsSync(fullPath)) return '';
    return fs.readFileSync(fullPath, 'utf8');
  }

  /**
   * Checks if a file exists in the sandbox.
   * @param {string} relativeOrAbsPath
   * @returns {Promise<boolean>}
   */
  async exists(relativeOrAbsPath) {
    const fullPath = path.isAbsolute(relativeOrAbsPath)
      ? relativeOrAbsPath
      : path.join(this.sandboxDir, relativeOrAbsPath);
    return fs.existsSync(fullPath);
  }

  /**
   * Sets file or directory permissions in sandbox.
   * @param {string} relativeOrAbsPath
   * @param {number} mode
   */
  async chmod(relativeOrAbsPath, mode) {
    const fullPath = path.isAbsolute(relativeOrAbsPath)
      ? relativeOrAbsPath
      : path.join(this.sandboxDir, relativeOrAbsPath);
    fs.chmodSync(fullPath, mode);
  }

  /**
   * Returns isolated environment variables pointing to this sandbox.
   * @param {Object} [overrides={}]
   * @returns {NodeJS.ProcessEnv}
   */
  getEnvVars(overrides = {}) {
    const nodePath = [
      path.join(this.sandboxDir, 'node_modules'),
      path.join(this.rootDir, 'node_modules'),
      process.env.NODE_PATH || ''
    ].filter(Boolean).join(':');

    // Discover system Chrome/Brave/Chromium binary
    const chromePath = process.env.CHROME_PATH ||
      process.env.PLAYWRIGHT_CHROME_PATH ||
      (fs.existsSync('/usr/bin/brave') ? '/usr/bin/brave' :
      (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' :
      (fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : '')));

    const cleanEnv = { ...process.env };
    delete cleanEnv.TERABOX_NDUS;
    delete cleanEnv.TERABOX_JSTOKEN;
    delete cleanEnv.TERABOX_BASE_URL;

    return {
      ...cleanEnv,
      HOME: this.virtualHome,
      USERPROFILE: this.virtualHome,
      TERABOX_PROJECT_DIR: this.sandboxDir,
      NODE_PATH: nodePath,
      HEADLESS: 'true',
      CHROME_PATH: chromePath,
      PLAYWRIGHT_CHROME_PATH: chromePath,
      ...overrides,
    };
  }

  /**
   * Cleans up the sandbox directory and all its contents.
   */
  async cleanup() {
    try {
      if (fs.existsSync(this.sandboxDir)) {
        const restorePermissions = (dir) => {
          try {
            fs.chmodSync(dir, 0o777);
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              const full = path.join(dir, entry.name);
              try {
                fs.chmodSync(full, 0o777);
                if (entry.isDirectory()) restorePermissions(full);
              } catch (_) {}
            }
          } catch (_) {}
        };
        restorePermissions(this.sandboxDir);
        fs.rmSync(this.sandboxDir, { recursive: true, force: true });
      }
    } catch (err) {
      // Best-effort cleanup
    }
    TestSandbox.activeSandboxes.delete(this.sandboxDir);
  }
}

/**
 * Scoped Execution Helper ensuring guaranteed cleanup
 * @template T
 * @param {string} name
 * @param {(sandbox: TestSandbox) => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withSandbox(name, fn) {
  const sandbox = new TestSandbox(name);
  await sandbox.init();
  try {
    return await fn(sandbox);
  } finally {
    await sandbox.cleanup();
  }
}

module.exports = { TestSandbox, withSandbox };
