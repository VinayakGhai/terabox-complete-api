const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const axios = require('axios');
const TeraboxUploader = require('terabox-upload-tool');

const currentEnvPath = process.env.ENV_PATH || (fs.existsSync(path.join(__dirname, '.env')) ? path.join(__dirname, '.env') : path.join(os.homedir(), '.env'));
require('dotenv').config({ path: currentEnvPath, override: true });

// Browser headers to ensure compatibility with TeraBox endpoints
axios.defaults.headers.common['User-Agent'] = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
axios.defaults.headers.common['Accept'] = 'application/json, text/plain, */*';
axios.defaults.headers.common['Accept-Language'] = 'en-US,en;q=0.9';
axios.defaults.headers.common['Accept-Encoding'] = 'gzip, deflate, br';
axios.defaults.headers.common['Referer'] = 'https://www.1024terabox.com/main';
axios.defaults.headers.common['Connection'] = 'keep-alive';

const HISTORY_FILE = path.join(os.homedir(), '.terabox_history.json');

function sendDesktopNotification(title, message, isSuccess = true) {
  try {
    const icon = isSuccess ? 'checkbox-checked-symbolic' : 'dialog-error-symbolic';
    spawnSync('notify-send', ['-t', '2000', '-i', icon, title, message]);
  } catch (_) {}
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDateTime(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

function appendHistory(entry) {
  try {
    let history = [];
    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, 'utf8');
      history = JSON.parse(data);
    }
    history.unshift(entry);
    if (history.length > 500) history = history.slice(0, 500);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
  } catch (e) {
    // ignore
  }
}

function displayHistory() {
  if (!fs.existsSync(HISTORY_FILE)) {
    console.log('\x1b[33mNo upload history found yet. Upload a file using "store <file>"!\x1b[0m');
    return;
  }
  try {
    const data = fs.readFileSync(HISTORY_FILE, 'utf8');
    const history = JSON.parse(data);
    if (!Array.isArray(history) || history.length === 0) {
      console.log('\x1b[33mUpload history is empty.\x1b[0m');
      return;
    }

    console.log('\n\x1b[36m=================================== TeraBox Upload History ===================================\x1b[0m\n');
    console.log(
      '\x1b[1m' +
      'Date & Time'.padEnd(22) +
      'File Name'.padEnd(28) +
      'Size'.padEnd(14) +
      'Remote Path'.padEnd(25) +
      'Status' +
      '\x1b[0m'
    );
    console.log('-'.repeat(98));

    history.forEach(item => {
      const time = (item.timestamp || '').padEnd(22);
      const name = (item.fileName || '').length > 25 ? item.fileName.slice(0, 22) + '...' : (item.fileName || '');
      const size = (item.sizeFormatted || '').padEnd(14);
      const remote = (item.remotePath || '').length > 23 ? item.remotePath.slice(0, 20) + '...' : (item.remotePath || '');
      const status = item.status === 'SUCCESS' ? '\x1b[32m✓ SUCCESS\x1b[0m' : '\x1b[31m✕ FAILED\x1b[0m';
      console.log(`${time}${name.padEnd(28)}${size}${remote.padEnd(25)}${status}`);
    });

    console.log('\n\x1b[36m==============================================================================================\x1b[0m\n');
  } catch (e) {
    console.error('Failed to read history:', e.message);
  }
}

function clearHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      fs.unlinkSync(HISTORY_FILE);
    }
    console.log('\x1b[32m✓ TeraBox upload history log cleared.\x1b[0m');
  } catch (e) {
    console.error('Failed to clear history:', e.message);
  }
}

function updateEnvFile(filePath, updates) {
  try {
    let content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    const newline = content.includes('\r\n') ? '\r\n' : '\n';
    const lines = content ? content.split(/\r?\n/) : [];
    const keysToUpdate = Object.keys(updates);
    const updatedKeys = new Set();

    const newLines = lines.map(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return line;
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) return line;
      const key = line.substring(0, eqIdx).trim();
      if (updates[key] !== undefined && !updatedKeys.has(key)) {
        updatedKeys.add(key);
        return `${key}=${updates[key]}`;
      }
      return line;
    });

    keysToUpdate.forEach(key => {
      if (!updatedKeys.has(key)) {
        newLines.push(`${key}=${updates[key]}`);
      }
    });

    fs.writeFileSync(filePath, newLines.join(newline), 'utf8');
  } catch (e) {
    // ignore
  }
}

function autoSelfHealNdusFromBrowser() {
  const pyScript = path.join(__dirname, 'extract_browser_creds.py');
  if (!fs.existsSync(pyScript)) return false;

  console.log('\x1b[33m⚡ Attempting background ndus session recovery from Brave browser...\x1b[0m');
  try {
    const res = spawnSync('python3', [pyScript], { encoding: 'utf8', timeout: 5000 });
    if (res.stdout) {
      const freshNdus = res.stdout.trim();
      if (freshNdus && freshNdus.length >= 15) {
        updateEnvFile(currentEnvPath, { TERABOX_NDUS: freshNdus });
        process.env.TERABOX_NDUS = freshNdus;
        console.log(`\x1b[32m✓ Successfully background-refreshed TERABOX_NDUS cookie from Brave browser!\x1b[0m`);
        return true;
      }
    }
  } catch (e) {
    // ignore
  }
  return false;
}

async function httpGetWithRetry(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await axios.get(url, options);
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 300 * (i + 1)));
    }
  }
}

async function resolveServerSideCredentials(isRetry = false) {
  let ndus = (process.env.TERABOX_NDUS || '').trim();
  const workerUrl = process.env.TERABOX_WORKER_URL || 'http://127.0.0.1:8787';
  const appId = process.env.TERABOX_APPID || '250528';

  if (!ndus || ndus.startsWith('EXPIRED')) {
    if (!isRetry && autoSelfHealNdusFromBrowser()) {
      return resolveServerSideCredentials(true);
    }
    console.log('\x1b[31m✕ Missing or invalid TERABOX_NDUS in .env file.\x1b[0m');
    return null;
  }

  // Direct server-side resolution via TeraBox 1024terabox.com endpoint
  try {
    const mainRes = await httpGetWithRetry('https://www.1024terabox.com/main', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Cookie': `lang=en; ndus=${ndus};`,
        'Referer': 'https://www.1024terabox.com/main'
      },
      timeout: 10000
    }, 3);

    const html = mainRes.data || '';
    const matchJs = html.match(/fn%28%22([a-zA-Z0-9]{30,})%22%29/i) || html.match(/fn\([\"']([a-zA-Z0-9]{30,})[\"']\)/i);

    if (matchJs && matchJs[1]) {
      const jsToken = matchJs[1];
      return {
        ndus: ndus,
        jsToken: jsToken,
        appId: appId.trim(),
        workerUrl
      };
    } else {
      if (!isRetry && autoSelfHealNdusFromBrowser()) {
        return resolveServerSideCredentials(true);
      }
      console.log(`\x1b[31m✕ TeraBox session expired or invalid ndus cookie.\x1b[0m`);
      return null;
    }
  } catch (e) {
    if (!isRetry && autoSelfHealNdusFromBrowser()) {
      return resolveServerSideCredentials(true);
    }
    console.log(`\x1b[31m✕ TeraBox token resolution error: ${e.message}\x1b[0m`);
    return null;
  }
}

async function checkCredentials() {
  console.log('\x1b[36m--- TeraBox Credentials Health Check (Worker Token Proxy) ---\x1b[0m');
  const creds = await resolveServerSideCredentials();
  if (creds) {
    console.log('\x1b[32m✓ TeraBox Cloudflare Worker Proxy & Credentials are VALID and ACTIVE!\x1b[0m');
    console.log(`\x1b[36m✓ Server-Side Resolved jsToken: ${creds.jsToken.substring(0, 12)}...\x1b[0m`);
    return true;
  } else {
    process.exit(1);
    return false;
  }
}

async function uploadSingleFile(filePath, remoteFolder = '/') {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`\x1b[31mError: File not found at path "${resolvedPath}".\x1b[0m`);
    sendDesktopNotification('TeraBox Upload Error', `File not found: ${filePath}`, false);
    return false;
  }

  const stats = fs.statSync(resolvedPath);
  if (stats.isDirectory()) {
    console.error(`\x1b[31mError: Path "${resolvedPath}" is a directory. Use "store_dir <folder>" to upload directories.\x1b[0m`);
    return false;
  }

  const creds = await resolveServerSideCredentials();
  if (!creds) {
    sendDesktopNotification('TeraBox Upload Error', `Session credentials expired for ${path.basename(resolvedPath)}`, false);
    return false;
  }

  const fileName = path.basename(resolvedPath);
  const targetPath = remoteFolder.startsWith('/') ? remoteFolder : '/' + remoteFolder;
  const normalizedTargetPath = targetPath.endsWith('/') && targetPath.length > 1 ? targetPath.slice(0, -1) : targetPath;
  const fullRemotePath = normalizedTargetPath === '/' ? `/${fileName}` : `${normalizedTargetPath}/${fileName}`;
  const fileSizeFormatted = formatFileSize(stats.size);
  const timestamp = formatDateTime();

  console.log(`\x1b[36mStarting upload:\x1b[0m ${fileName} (${fileSizeFormatted}) -> TeraBox:${fullRemotePath}`);

  let lastPercent = -1;
  const progressCallback = (loaded, total) => {
    if (total > 0) {
      const percent = Math.round((loaded / total) * 100);
      if (percent !== lastPercent) {
        lastPercent = percent;
        process.stdout.write(`Upload progress: ${percent}%\r`);
      }
    }
  };

  try {
    const uploader = new TeraboxUploader({
      ndus: creds.ndus,
      jsToken: creds.jsToken,
      appId: creds.appId,
    });

    const result = await uploader.uploadFile(resolvedPath, progressCallback, normalizedTargetPath);
    process.stdout.write('\n');

    if (result && result.success) {
      console.log(`\x1b[32m✓ Upload successful! Remote path: ${fullRemotePath}\x1b[0m`);
      appendHistory({
        timestamp,
        fileName,
        localPath: resolvedPath,
        remotePath: fullRemotePath,
        sizeBytes: stats.size,
        sizeFormatted: fileSizeFormatted,
        status: 'SUCCESS',
        error: null
      });
      sendDesktopNotification('TeraBox Upload Complete', `✓ Uploaded ${fileName} to TeraBox:${fullRemotePath}`, true);
      return true;
    } else {
      const errorMsg = result ? (typeof result.message === 'object' ? JSON.stringify(result.message) : (result.message || JSON.stringify(result))) : 'Unknown error';
      console.error(`\x1b[31m✕ Upload failed: ${errorMsg}\x1b[0m`);
      appendHistory({
        timestamp,
        fileName,
        localPath: resolvedPath,
        remotePath: fullRemotePath,
        sizeBytes: stats.size,
        sizeFormatted: fileSizeFormatted,
        status: 'FAILED',
        error: errorMsg
      });
      sendDesktopNotification('TeraBox Upload Failed', `✕ ${fileName}: ${errorMsg}`, false);
      return false;
    }
  } catch (err) {
    process.stdout.write('\n');
    console.error(`\x1b[31m✕ Upload failed with error: ${err.message}\x1b[0m`);
    appendHistory({
      timestamp,
      fileName,
      localPath: resolvedPath,
      remotePath: fullRemotePath,
      sizeBytes: stats.size,
      sizeFormatted: fileSizeFormatted,
      status: 'FAILED',
      error: err.message
    });
    sendDesktopNotification('TeraBox Upload Failed', `✕ ${fileName}: ${err.message}`, false);
    return false;
  }
}

async function uploadDirectory(dirPath, remoteFolder = '/') {
  const resolvedDir = path.resolve(dirPath);
  if (!fs.existsSync(resolvedDir) || !fs.statSync(resolvedDir).isDirectory()) {
    console.error(`\x1b[31mError: Directory not found at "${resolvedDir}".\x1b[0m`);
    return;
  }

  const files = fs.readdirSync(resolvedDir).filter(f => {
    const p = path.join(resolvedDir, f);
    return fs.statSync(p).isFile();
  });

  if (files.length === 0) {
    console.log(`\x1b[33mNo files found in directory "${resolvedDir}".\x1b[0m`);
    return;
  }

  console.log(`\x1b[36mFound ${files.length} file(s) in "${resolvedDir}" to upload...\x1b[0m\n`);
  let successCount = 0;
  for (const file of files) {
    const fullPath = path.join(resolvedDir, file);
    const ok = await uploadSingleFile(fullPath, remoteFolder);
    if (ok) successCount++;
    console.log('');
  }

  console.log(`\x1b[32m✓ Directory upload completed: ${successCount}/${files.length} files uploaded.\x1b[0m`);
  sendDesktopNotification('TeraBox Batch Upload Complete', `✓ Uploaded ${successCount}/${files.length} files to TeraBox:${remoteFolder}`, true);
}

async function main() {
  const rawArgs = process.argv.slice(2);

  if (rawArgs.length === 0 || rawArgs[0] === '--help' || rawArgs[0] === '-h') {
    console.log(`
\x1b[36m--- TeraBox CLI Uploader (Cloudflare Worker Token Proxy) ---\x1b[0m
Usage:
  store <file-path> [remote-folder]     Upload a single file (instant background detachment)
  store --sync <file-path>              Upload a single file in foreground terminal
  store_log                             View upload history log
  store_dir <folder> [remote-folder]    Upload all files in a directory
  store_check                           Check credentials health & Cloudflare Worker token proxy status
  store_clear                           Clear upload history log
    `);
    return;
  }

  const isAsyncWorker = rawArgs.includes('--async-worker');
  const isSync = rawArgs.includes('--sync');
  const args = rawArgs.filter(a => a !== '--async-worker' && a !== '--sync');

  const firstArg = args[0];

  if (firstArg === '--history' || firstArg === '--log') {
    displayHistory();
    return;
  }

  if (firstArg === '--clear-log') {
    clearHistory();
    return;
  }

  if (firstArg === '--check') {
    await checkCredentials();
    return;
  }

  // Instant background detachment for upload operations
  if (!isSync && !isAsyncWorker && (firstArg === '--dir' || (firstArg && !firstArg.startsWith('-')))) {
    const targetName = firstArg === '--dir' ? path.basename(args[1] || '') : path.basename(firstArg);
    const child = spawn(process.execPath, [__filename, '--async-worker', ...rawArgs], {
      detached: true,
      stdio: 'ignore',
      env: process.env,
      cwd: process.cwd()
    });
    child.unref();

    console.log(`\x1b[36m🚀 Upload queued in background (${targetName})...\x1b[0m`);
    process.exit(0);
  }

  if (firstArg === '--dir') {
    const dirPath = args[1];
    const remoteFolder = args[2] || '/';
    if (!dirPath) {
      console.error('\x1b[31mError: Please specify a directory path.\x1b[0m');
      process.exit(1);
    }
    await uploadDirectory(dirPath, remoteFolder);
    return;
  }

  const filePath = args[0];
  const remoteFolder = args[1] || '/';
  const success = await uploadSingleFile(filePath, remoteFolder);
  if (!success) process.exit(1);
}

main();
