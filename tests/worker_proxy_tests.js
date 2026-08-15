/**
 * worker_proxy_tests.js
 * Comprehensive unit and integration test suite for Cloudflare Worker Token Proxy Architecture.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const { colors } = require('./harness');

const rootDir = path.resolve(__dirname, '..');

const TESTS = [
  {
    id: 'WPT-01',
    name: 'Playwright & Browser Profile Complete Removal',
    fn: () => {
      assert(!fs.existsSync(path.join(rootDir, 'refresh_creds.js')), 'refresh_creds.js must be deleted');
      assert(!fs.existsSync(path.join(rootDir, 'browser_profile')), 'browser_profile/ directory must be deleted');
      const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
      assert(!pkg.dependencies || !pkg.dependencies.playwright, 'playwright dependency must be removed from package.json');
    }
  },
  {
    id: 'WPT-02',
    name: 'Cloudflare Worker Code & Wrangler Config Presence',
    fn: () => {
      assert(fs.existsSync(path.join(rootDir, 'worker/index.js')), 'worker/index.js must exist');
      assert(fs.existsSync(path.join(rootDir, 'wrangler.toml')), 'wrangler.toml must exist');
      const workerCode = fs.readFileSync(path.join(rootDir, 'worker/index.js'), 'utf8');
      assert(workerCode.includes('resolveJsToken'), 'Worker code must implement server-side resolveJsToken');
      assert(workerCode.includes('x-terabox-ndus'), 'Worker code must handle x-terabox-ndus header');
    }
  },
  {
    id: 'WPT-03',
    name: 'Local .env Config & TERABOX_JSTOKEN Removal',
    fn: () => {
      const envContent = fs.readFileSync(path.join(rootDir, '.env'), 'utf8');
      assert(envContent.includes('TERABOX_NDUS='), '.env must contain TERABOX_NDUS');
      assert(envContent.includes('TERABOX_WORKER_URL='), '.env must contain TERABOX_WORKER_URL');
      assert(!envContent.includes('TERABOX_JSTOKEN='), '.env must NOT contain TERABOX_JSTOKEN');
    }
  },
  {
    id: 'WPT-04',
    name: 'CLI Shell Shortcuts (.bashrc & .zshrc) Alignment',
    fn: () => {
      const bashrc = fs.readFileSync(path.join(rootDir, '.bashrc'), 'utf8');
      const zshrc = fs.readFileSync(path.join(rootDir, '.zshrc'), 'utf8');

      ['store', 'store_dir', 'store_log', 'store_check', 'store_clear', 'store_refresh'].forEach(cmd => {
        assert(bashrc.includes(`${cmd}()`), `.bashrc must define ${cmd}`);
        assert(zshrc.includes(`${cmd}()`), `.zshrc must define ${cmd}`);
      });

      assert(!bashrc.includes('refresh_creds.js'), '.bashrc must not reference refresh_creds.js');
      assert(!zshrc.includes('refresh_creds.js'), '.zshrc must not reference refresh_creds.js');
    }
  },
  {
    id: 'WPT-05',
    name: 'Antigravity Workspace Speedup Settings',
    fn: () => {
      const settingsPath = path.join(rootDir, '.vscode/settings.json');
      assert(fs.existsSync(settingsPath), '.vscode/settings.json must exist');
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      assert.strictEqual(settings['terminal.autoExecution'], 'Always proceed');
      assert.strictEqual(settings['antigravity.terminal.sandbox'], true);
    }
  },
  {
    id: 'WPT-06',
    name: 'Workflow Files & Descriptions in .agent/workflows/',
    fn: () => {
      ['test.md', 'deploy.md', 'upload_check.md'].forEach(file => {
        const wfPath = path.join(rootDir, '.agent/workflows', file);
        assert(fs.existsSync(wfPath), `.agent/workflows/${file} must exist`);
        const content = fs.readFileSync(wfPath, 'utf8');
        assert(content.includes('description:'), `.agent/workflows/${file} must contain YAML frontmatter description`);
        assert(content.includes('// turbo'), `.agent/workflows/${file} must tag safe steps with // turbo`);
      });
    }
  },
  {
    id: 'WPT-07',
    name: 'Project Documentation (AGENTS.md & agents.md)',
    fn: () => {
      assert(fs.existsSync(path.join(rootDir, 'AGENTS.md')), 'AGENTS.md must exist');
      assert(fs.existsSync(path.join(rootDir, 'agents.md')), 'agents.md must exist');
      const doc = fs.readFileSync(path.join(rootDir, 'AGENTS.md'), 'utf8');
      assert(doc.includes('Cloudflare Worker Token Proxy'), 'Documentation must describe Cloudflare Worker proxy');
    }
  },
  {
    id: 'WPT-08',
    name: 'Background Cookie Extractor Utility',
    fn: () => {
      assert(fs.existsSync(path.join(rootDir, 'extract_browser_creds.py')), 'extract_browser_creds.py must exist');
    }
  },
  {
    id: 'WPT-09',
    name: 'Live Single File Upload & Credentials Resolution Verification',
    fn: () => {
      const tmpFile = path.join(os.tmpdir(), `test_wpt09_${Date.now()}.txt`);
      fs.writeFileSync(tmpFile, 'WPT-09 test upload payload content\n');

      const res = spawnSync(process.execPath, [path.join(rootDir, 'upload.js'), tmpFile, '/'], {
        encoding: 'utf8',
        timeout: 15000,
        cwd: rootDir
      });

      try { fs.unlinkSync(tmpFile); } catch (_) {}

      assert.strictEqual(res.status, 0, `Upload execution must exit with code 0. Output: ${res.stdout || res.stderr}`);
      assert(res.stdout.includes('Upload successful!'), `Stdout must contain "Upload successful!". Output: ${res.stdout}`);
    }
  },
  {
    id: 'WPT-10',
    name: 'Live Directory Batch Upload Verification',
    fn: () => {
      const tmpDir = path.join(os.tmpdir(), `test_wpt10_dir_${Date.now()}`);
      fs.mkdirSync(tmpDir, { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'file1.txt'), 'batch file 1 payload\n');
      fs.writeFileSync(path.join(tmpDir, 'file2.txt'), 'batch file 2 payload\n');

      const res = spawnSync(process.execPath, [path.join(rootDir, 'upload.js'), '--dir', tmpDir, '/test_batch/'], {
        encoding: 'utf8',
        timeout: 20000,
        cwd: rootDir
      });

      try {
        fs.unlinkSync(path.join(tmpDir, 'file1.txt'));
        fs.unlinkSync(path.join(tmpDir, 'file2.txt'));
        fs.rmdirSync(tmpDir);
      } catch (_) {}

      assert.strictEqual(res.status, 0, `Batch directory upload must exit code 0. Output: ${res.stdout || res.stderr}`);
      assert(res.stdout.includes('Directory upload completed'), `Stdout must contain "Directory upload completed". Output: ${res.stdout}`);
    }
  },
  {
    id: 'WPT-11',
    name: 'Upload History Logging & Log Clearance Command Verification',
    fn: () => {
      const logRes = spawnSync(process.execPath, [path.join(rootDir, 'upload.js'), '--log'], {
        encoding: 'utf8',
        cwd: rootDir
      });
      assert.strictEqual(logRes.status, 0, '--log command must exit with code 0');
      assert(logRes.stdout.includes('TeraBox Upload History') || logRes.stdout.includes('No upload history'), 'Must print history header or empty state');
    }
  }
];

async function run({ verbose = false } = {}) {
  console.log(`\n${colors.bold}${colors.cyan}================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}  Running Worker Proxy Architecture Test Suite                 ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}================================================================${colors.reset}\n`);

  let passed = 0;
  let failed = 0;

  for (const t of TESTS) {
    try {
      await t.fn();
      passed++;
      console.log(`  ${colors.green}✓ [${t.id}] ${t.name}${colors.reset}`);
    } catch (err) {
      failed++;
      console.log(`  ${colors.red}✕ [${t.id}] ${t.name}${colors.reset}`);
      if (verbose) console.error(err);
    }
  }

  console.log(`\n--- Worker Proxy Suite Results: ${colors.green}${passed} Passed${colors.reset}, ${failed > 0 ? colors.red : colors.green}${failed} Failed${colors.reset}, ${TESTS.length} Total ---\n`);

  return { passed, failed, total: TESTS.length };
}

if (require.main === module) {
  run({ verbose: true });
}

module.exports = { run, TESTS };
