#!/usr/bin/env node
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
const TASKS_FILE = path.join(os.homedir(), '.terabox_active_tasks.json');

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

function updateTaskState(taskId, data) {
  try {
    let tasks = {};
    if (fs.existsSync(TASKS_FILE)) {
      try {
        tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
      } catch (_) {}
    }
    tasks[taskId] = {
      ...(tasks[taskId] || {}),
      ...data,
      updatedAt: Date.now()
    };

    // Clean old tasks (>30 mins)
    const now = Date.now();
    Object.keys(tasks).forEach(id => {
      if (now - tasks[id].updatedAt > 30 * 60 * 1000) {
        delete tasks[id];
      }
    });

    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf8');
  } catch (_) {}
}

function renderProgressBar(percent, width = 20) {
  const safePercent = Math.min(100, Math.max(0, percent));
  const filledLength = Math.round((width * safePercent) / 100);
  const emptyLength = width - filledLength;
  const filledStr = '█'.repeat(filledLength);
  const emptyStr = '░'.repeat(emptyLength);
  const color = safePercent === 100 ? '\x1b[32m' : (safePercent > 50 ? '\x1b[36m' : '\x1b[33m');
  return `${color}${filledStr}\x1b[90m${emptyStr}\x1b[0m \x1b[1m\x1b[33m${safePercent}%\x1b[0m`;
}

function displayActiveTracks() {
  if (!fs.existsSync(TASKS_FILE)) {
    console.log('\x1b[33mNo active background upload processes currently tracking.\x1b[0m');
    return;
  }

  try {
    const raw = fs.readFileSync(TASKS_FILE, 'utf8');
    const tasks = JSON.parse(raw);
    const taskIds = Object.keys(tasks);

    if (taskIds.length === 0) {
      console.log('\x1b[33mNo active background upload processes currently tracking.\x1b[0m');
      return;
    }

    console.log('\n\x1b[36m=================================== Active TeraBox Upload Processes ===================================\x1b[0m\n');
    console.log(
      '\x1b[1m' +
      'PID'.padEnd(10) +
      'File Name'.padEnd(28) +
      'Size'.padEnd(14) +
      'Progress Bar & Percent'.padEnd(35) +
      'Status' +
      '\x1b[0m'
    );
    console.log('-'.repeat(98));

    taskIds.forEach(id => {
      const task = tasks[id];
      const pidStr = (String(id).slice(-8)).padEnd(10);
      const name = (task.fileName || '').length > 25 ? task.fileName.slice(0, 22) + '...' : (task.fileName || '');
      const sizeStr = formatFileSize(task.sizeBytes || task.total || 0).padEnd(14);
      const percent = task.percent || 0;
      const barStr = renderProgressBar(percent, 20).padEnd(35);
      
      let statusStr = '\x1b[33m⚡ UPLOADING\x1b[0m';
      if (task.status === 'SUCCESS' || percent === 100) {
        statusStr = '\x1b[32m✓ COMPLETED\x1b[0m';
      } else if (task.status === 'FAILED') {
        statusStr = '\x1b[31m✕ FAILED\x1b[0m';
      }

      console.log(`${pidStr}${name.padEnd(28)}${sizeStr}${barStr}${statusStr}`);
    });

    console.log('\n\x1b[36m=======================================================================================================\x1b[0m\n');
  } catch (e) {
    console.error('Failed to read active tracking state:', e.message);
  }
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
    console.log('\x1b[33mNo upload history found yet. Upload a file using "storetera upload <file>" or "stt <file>"!\x1b[0m');
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
    if (fs.existsSync(TASKS_FILE)) {
      fs.unlinkSync(TASKS_FILE);
    }
    console.log('\x1b[32m✓ TeraBox upload history log and active tracking cache cleared successfully!\x1b[0m');
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

    // Verify account profile name
    try {
      const infoRes = await axios.get('https://www.1024terabox.com/api/home/info?app_id=250528', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Cookie': `lang=en; ndus=${creds.ndus};`,
          'Referer': 'https://www.1024terabox.com/main'
        }
      });
      if (infoRes.data && infoRes.data.data) {
        console.log(`\x1b[32m✓ Connected Account: ${infoRes.data.data.username || 'Active User'} (UK: ${infoRes.data.data.uk || 'N/A'})\x1b[0m`);
      }
    } catch (_) {}

    return true;
  } else {
    process.exit(1);
    return false;
  }
}

async function deleteRemoteFiles(targetPaths) {
  if (!Array.isArray(targetPaths) || targetPaths.length === 0) {
    console.error('\x1b[31mError: Please specify one or more remote file/folder paths to delete.\x1b[0m');
    return false;
  }

  const creds = await resolveServerSideCredentials();
  if (!creds) return false;

  const normalizedPaths = targetPaths.map(p => p.startsWith('/') ? p : '/' + p);
  console.log(`\x1b[36mDeleting remote cloud file(s):\x1b[0m ${normalizedPaths.join(', ')}`);

  try {
    const uploader = new TeraboxUploader({
      ndus: creds.ndus,
      jsToken: creds.jsToken,
      appId: creds.appId,
    });

    const res = await uploader.deleteFiles(normalizedPaths);

    if (res && (res.errno === 0 || res.success === true)) {
      console.log(`\x1b[32m✓ Successfully deleted from TeraBox cloud storage!\x1b[0m`);
      sendDesktopNotification('TeraBox File Deleted', `✓ Deleted ${normalizedPaths.join(', ')}`, true);
      return true;
    } else {
      const errorMsg = res ? (typeof res.message === 'object' ? JSON.stringify(res.message) : JSON.stringify(res)) : 'Unknown error';
      console.error(`\x1b[31m✕ Remote deletion failed: ${errorMsg}\x1b[0m`);
      sendDesktopNotification('TeraBox Delete Failed', `✕ Deletion failed: ${errorMsg}`, false);
      return false;
    }
  } catch (err) {
    console.error(`\x1b[31m✕ Deletion failed with error: ${err.message}\x1b[0m`);
    sendDesktopNotification('TeraBox Delete Failed', `✕ Deletion error: ${err.message}`, false);
    return false;
  }
}

async function listRemoteFiles(remoteFolder = '/') {
  const creds = await resolveServerSideCredentials();
  if (!creds) return;

  try {
    const uploader = new TeraboxUploader({
      ndus: creds.ndus,
      jsToken: creds.jsToken,
      appId: creds.appId,
    });

    const res = await uploader.fetchFileList(remoteFolder);
    if (res && res.success && res.data && res.data.list) {
      console.log(`\n\x1b[36m====================== TeraBox Remote Cloud Files (${remoteFolder}) ======================\x1b[0m\n`);
      console.log(
        '\x1b[1m' +
        'File Name'.padEnd(35) +
        'Size'.padEnd(14) +
        'Type'.padEnd(12) +
        'Remote Path' +
        '\x1b[0m'
      );
      console.log('-'.repeat(85));
      res.data.list.forEach(item => {
        const name = (item.server_filename || '').length > 32 ? item.server_filename.slice(0, 29) + '...' : (item.server_filename || '');
        const size = formatFileSize(item.size || 0).padEnd(14);
        const type = item.isdir === 1 ? '\x1b[33mFolder\x1b[0m'.padEnd(21) : '\x1b[32mFile\x1b[0m'.padEnd(21);
        const pathStr = item.path || '';
        console.log(`${name.padEnd(35)}${size}${type}${pathStr}`);
      });
      console.log('\n\x1b[36m========================================================================================\x1b[0m\n');
    } else {
      console.log('\x1b[33mNo files found or empty directory.\x1b[0m');
    }
  } catch (e) {
    console.error(`\x1b[31m✕ Failed to fetch file list: ${e.message}\x1b[0m`);
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
    console.error(`\x1b[31mError: Path "${resolvedPath}" is a directory. Use "storetera dir <folder>" or "stt dir <folder>" to upload directories.\x1b[0m`);
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
  const taskId = process.env.TERABOX_TASK_ID || process.pid;

  updateTaskState(taskId, {
    fileName,
    remotePath: fullRemotePath,
    sizeBytes: stats.size,
    percent: 0,
    status: 'UPLOADING'
  });

  console.log(`\x1b[36mStarting upload:\x1b[0m ${fileName} (${fileSizeFormatted}) -> TeraBox:${fullRemotePath}`);

  let lastPercent = -1;
  const progressCallback = (loaded, total) => {
    if (total > 0) {
      const percent = Math.round((loaded / total) * 100);
      if (percent !== lastPercent) {
        lastPercent = percent;
        updateTaskState(taskId, {
          fileName,
          remotePath: fullRemotePath,
          sizeBytes: stats.size,
          percent: percent,
          status: 'UPLOADING'
        });
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
      updateTaskState(taskId, {
        fileName,
        remotePath: fullRemotePath,
        sizeBytes: stats.size,
        percent: 100,
        status: 'SUCCESS'
      });
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
      updateTaskState(taskId, {
        fileName,
        remotePath: fullRemotePath,
        sizeBytes: stats.size,
        status: 'FAILED'
      });
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
    updateTaskState(taskId, {
      fileName,
      remotePath: fullRemotePath,
      sizeBytes: stats.size,
      status: 'FAILED'
    });
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

function displayHelpMenu() {
  console.log(`
\x1b[36m=================================================================================\x1b[0m
\x1b[1m\x1b[34m          Terabox Complete API & CLI Uploader — VinayakGhai (Indie Dev)          \x1b[0m
\x1b[36m=================================================================================\x1b[0m

\x1b[33m💡 Tip: Use "storetera" or "stt" short alias anytime from your terminal!\x1b[0m

\x1b[1mREVAMPED CLI COMMAND SYNTAX:\x1b[0m
  \x1b[32mstt upload <file> [remote-folder]\x1b[0m      Upload file (Instant Background Detached <3ms)
  \x1b[32mstt upload --sync <file>\x1b[0m               Upload file in foreground with progress bar
  \x1b[32mstt dir <folder> [remote-folder]\x1b[0m       Upload entire directory recursively
  \x1b[32mstt track\x1b[0m                              Track active background uploads & percent progress
  \x1b[32mstt delete <remote-path>\x1b[0m               Delete remote file or directory on TeraBox cloud
  \x1b[32mstt list [folder]\x1b[0m                      List all remote files in TeraBox storage
  \x1b[32mstt check\x1b[0m                              Check Worker proxy & account session health
  \x1b[32mstt log\x1b[0m                                View upload history log
  \x1b[32mstt clear\x1b[0m                              Clear upload history log & tracking cache
  \x1b[32mstt help\x1b[0m                               Display this interactive help menu

\x1b[1mEXAMPLE USAGE COMMANDS:\x1b[0m
  \x1b[36mstt my_file.zip\x1b[0m                        Instant background upload to root '/'
  \x1b[36mstt upload my_file.zip /backups\x1b[0m         Upload to remote folder '/backups'
  \x1b[36mstt dir my_photos /photos\x1b[0m               Batch upload directory to '/photos'
  \x1b[36mstt track\x1b[0m                              View live color progress bars
  \x1b[36mstt delete /backups/old_file.zip\x1b[0m        Purge remote file from cloud
  \x1b[36mstt log clear\x1b[0m                           Clear all upload history logs

\x1b[1mDOCUMENTATION & MANUAL:\x1b[0m
  \x1b[35mLEARN IT PDF Guide:\x1b[0m Open LEARN_IT.pdf for full setup, EULA, and architecture docs.

\x1b[36m=================================================================================\x1b[0m
  `);
}

async function main() {
  let rawArgs = process.argv.slice(2);

  if (rawArgs.length > 0 && (rawArgs[0] === 'stt' || rawArgs[0] === 'storetera')) {
    rawArgs = rawArgs.slice(1);
  }

  if (rawArgs.length === 0) {
    displayHelpMenu();
    return;
  }

  const isAsyncWorker = rawArgs.includes('--async-worker');
  const isSync = rawArgs.includes('--sync');
  const args = rawArgs.filter(a => a !== '--async-worker' && a !== '--sync');

  const firstArg = args[0];
  const secondArg = args[1];

  // Handle help requests explicitly
  if (firstArg === 'help' || firstArg === '--help' || firstArg === '-h') {
    displayHelpMenu();
    return;
  }

  // Handle 'stt log clear' or 'stt clear'
  if (firstArg === 'clear' || firstArg === '--clear-log' || (firstArg === 'log' && (secondArg === 'clear' || secondArg === '--clear'))) {
    clearHistory();
    return;
  }

  // Handle 'stt log help' or 'stt log'
  if (firstArg === 'log' || firstArg === '--log' || firstArg === '--history' || firstArg === 'history') {
    if (secondArg === 'help' || secondArg === '--help' || secondArg === '-h') {
      displayHelpMenu();
      return;
    }
    displayHistory();
    return;
  }

  // Handle 'stt track' or 'stt status'
  if (firstArg === 'track' || firstArg === '--track' || firstArg === 'status') {
    if (secondArg === 'clear') {
      clearHistory();
      return;
    }
    displayActiveTracks();
    return;
  }

  // Handle 'stt check'
  if (firstArg === 'check' || firstArg === '--check') {
    await checkCredentials();
    return;
  }

  // Handle 'stt list' or 'stt ls'
  if (firstArg === 'list' || firstArg === 'ls' || firstArg === '--list') {
    await listRemoteFiles(secondArg || '/');
    return;
  }

  // Handle 'stt delete' or 'stt rm'
  if (firstArg === 'delete' || firstArg === 'rm' || firstArg === '--delete') {
    const targets = args.slice(1);
    if (targets.length === 0) {
      console.log('\x1b[31m✕ Please specify a remote file or folder path to delete. Example: "stt delete /file.txt"\x1b[0m');
      displayHelpMenu();
      return;
    }
    await deleteRemoteFiles(targets);
    return;
  }

  let uploadPath = null;
  let remoteFolder = '/';
  let isDirectoryUpload = false;

  if (firstArg === 'upload') {
    uploadPath = args[1];
    remoteFolder = args[2] || '/';
  } else if (firstArg === 'dir' || firstArg === '--dir') {
    isDirectoryUpload = true;
    uploadPath = args[1];
    remoteFolder = args[2] || '/';
  } else if (firstArg && !firstArg.startsWith('-')) {
    uploadPath = firstArg;
    remoteFolder = args[1] || '/';
  }

  if (!uploadPath) {
    console.log(`\x1b[31m✕ Unrecognized command or missing parameters: "${rawArgs.join(' ')}"\x1b[0m`);
    displayHelpMenu();
    return;
  }

  // Instant background detachment for upload operations
  if (!isSync && !isAsyncWorker) {
    const targetName = path.basename(uploadPath);
    const child = spawn(process.execPath, [__filename, '--async-worker', ...rawArgs], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, TERABOX_TASK_ID: String(process.pid) },
      cwd: process.cwd()
    });
    const childTaskId = String(child.pid);
    child.unref();

    // Register initial task entry
    updateTaskState(childTaskId, {
      fileName: targetName,
      remotePath: remoteFolder,
      percent: 0,
      status: 'UPLOADING'
    });

    console.log(`\x1b[36m🚀 Upload queued in background (${targetName})...\x1b[0m`);
    process.exit(0);
  }

  if (isDirectoryUpload) {
    await uploadDirectory(uploadPath, remoteFolder);
  } else {
    const success = await uploadSingleFile(uploadPath, remoteFolder);
    if (!success) process.exit(1);
  }
}

main();
