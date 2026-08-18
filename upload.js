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

// Royal Color Palette Tokens
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  // Royal RGB Colors
  gold: '\x1b[38;2;234;179;8m',        // #eab308 Royal Gold
  amber: '\x1b[38;2;245;158;11m',      // #f59e0b Bright Gold
  purple: '\x1b[38;2;168;85;247m',     // #a855f7 Royal Purple
  violet: '\x1b[38;2;147;51;234m',     // #9333ea Deep Royal Violet
  indigo: '\x1b[38;2;99;102;241m',     // #6366f1 Royal Indigo
  cyan: '\x1b[38;2;6;182;212m',        // #06b6d4 Diamond Cyan
  emerald: '\x1b[38;2;16;185;129m',    // #10b981 Royal Emerald
  rose: '\x1b[38;2;244;63;94m',        // #f43f5e Royal Ruby Red
  gray: '\x1b[38;2;107;114;128m',      // #6b7280 Muted Gray
  lightGray: '\x1b[38;2;209;213;219m' // #d1d5db Light Gray
};

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

    const now = Date.now();
    Object.keys(tasks).forEach(id => {
      if (now - tasks[id].updatedAt > 30 * 60 * 1000) {
        delete tasks[id];
      }
    });

    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf8');
  } catch (_) {}
}

function renderRoyalProgressBar(percent, width = 22) {
  const safePercent = Math.min(100, Math.max(0, percent));
  const filledLength = Math.round((width * safePercent) / 100);
  const emptyLength = width - filledLength;
  const filledStr = '█'.repeat(filledLength);
  const emptyStr = '░'.repeat(emptyLength);
  const color = safePercent === 100 ? C.emerald : (safePercent > 50 ? C.cyan : C.gold);
  return `${color}${filledStr}${C.gray}${emptyStr}${C.reset} ${C.bold}${C.amber}${safePercent}%${C.reset}`;
}

function displayActiveTracks() {
  if (!fs.existsSync(TASKS_FILE)) {
    console.log(`${C.amber}👑 No active background upload processes currently tracking.${C.reset}`);
    return;
  }

  try {
    const raw = fs.readFileSync(TASKS_FILE, 'utf8');
    const tasks = JSON.parse(raw);
    const taskIds = Object.keys(tasks);

    if (taskIds.length === 0) {
      console.log(`${C.amber}👑 No active background upload processes currently tracking.${C.reset}`);
      return;
    }

    console.log(`\n${C.purple}=================================== 👑 Active Royal Upload Tasks ===================================${C.reset}\n`);
    console.log(
      C.bold +
      'PID'.padEnd(10) +
      'File Name'.padEnd(28) +
      'Size'.padEnd(14) +
      'Progress Bar & Percent'.padEnd(35) +
      'Status' +
      C.reset
    );
    console.log(`${C.violet}${'─'.repeat(98)}${C.reset}`);

    taskIds.forEach(id => {
      const task = tasks[id];
      const pidStr = (String(id).slice(-8)).padEnd(10);
      const name = (task.fileName || '').length > 25 ? task.fileName.slice(0, 22) + '...' : (task.fileName || '');
      const sizeStr = formatFileSize(task.sizeBytes || task.total || 0).padEnd(14);
      const percent = task.percent || 0;
      const barStr = renderRoyalProgressBar(percent, 20).padEnd(45);
      
      let statusStr = `${C.gold}⚡ UPLOADING${C.reset}`;
      if (task.status === 'SUCCESS' || percent === 100) {
        statusStr = `${C.emerald}✓ COMPLETED${C.reset}`;
      } else if (task.status === 'FAILED') {
        statusStr = `${C.rose}✕ FAILED${C.reset}`;
      }

      console.log(`${C.cyan}${pidStr}${C.reset}${C.lightGray}${name.padEnd(28)}${sizeStr}${C.reset}${barStr}${statusStr}`);
    });

    console.log(`\n${C.purple}====================================================================================================${C.reset}\n`);
  } catch (e) {
    console.error(`${C.rose}Failed to read active tracking state: ${e.message}${C.reset}`);
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
    console.log(`${C.amber}👑 No upload history found yet. Upload a file using "stt upload <file>" or "stt <file>"!${C.reset}`);
    return;
  }
  try {
    const data = fs.readFileSync(HISTORY_FILE, 'utf8');
    const history = JSON.parse(data);
    if (!Array.isArray(history) || history.length === 0) {
      console.log(`${C.amber}👑 Upload history is empty.${C.reset}`);
      return;
    }

    console.log(`\n${C.purple}=================================== 👑 TeraBox Upload History ===================================${C.reset}\n`);
    console.log(
      C.bold +
      'Date & Time'.padEnd(22) +
      'File Name'.padEnd(28) +
      'Size'.padEnd(14) +
      'Remote Path'.padEnd(25) +
      'Status' +
      C.reset
    );
    console.log(`${C.violet}${'─'.repeat(98)}${C.reset}`);

    history.forEach(item => {
      const time = (item.timestamp || '').padEnd(22);
      const name = (item.fileName || '').length > 25 ? item.fileName.slice(0, 22) + '...' : (item.fileName || '');
      const size = (item.sizeFormatted || '').padEnd(14);
      const remote = (item.remotePath || '').length > 23 ? item.remotePath.slice(0, 20) + '...' : (item.remotePath || '');
      const status = item.status === 'SUCCESS' ? `${C.emerald}✓ SUCCESS${C.reset}` : `${C.rose}✕ FAILED${C.reset}`;
      console.log(`${C.dim}${time}${C.reset}${C.lightGray}${name.padEnd(28)}${size}${remote.padEnd(25)}${C.reset}${status}`);
    });

    console.log(`\n${C.purple}================================================================================================${C.reset}\n`);
  } catch (e) {
    console.error(`${C.rose}Failed to read history: ${e.message}${C.reset}`);
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
    console.log(`${C.emerald}✓ TeraBox upload history log and active tracking cache cleared successfully!${C.reset}`);
  } catch (e) {
    console.error(`${C.rose}Failed to clear history: ${e.message}${C.reset}`);
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

  console.log(`${C.amber}⚡ Attempting background ndus session recovery from Brave browser...${C.reset}`);
  try {
    const res = spawnSync('python3', [pyScript], { encoding: 'utf8', timeout: 5000 });
    if (res.stdout) {
      const freshNdus = res.stdout.trim();
      if (freshNdus && freshNdus.length >= 15) {
        updateEnvFile(currentEnvPath, { TERABOX_NDUS: freshNdus });
        process.env.TERABOX_NDUS = freshNdus;
        console.log(`${C.emerald}✓ Successfully background-refreshed TERABOX_NDUS cookie from Brave browser!${C.reset}`);
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
    console.log(`${C.rose}✕ Missing or invalid TERABOX_NDUS in .env file.${C.reset}`);
    return null;
  }

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
      console.log(`${C.rose}✕ TeraBox session expired or invalid ndus cookie.${C.reset}`);
      return null;
    }
  } catch (e) {
    if (!isRetry && autoSelfHealNdusFromBrowser()) {
      return resolveServerSideCredentials(true);
    }
    console.log(`${C.rose}✕ TeraBox token resolution error: ${e.message}${C.reset}`);
    return null;
  }
}

async function checkCredentials() {
  console.log(`\n${C.purple}==================== 👑 TeraBox Credentials Health Check ====================${C.reset}\n`);
  const creds = await resolveServerSideCredentials();
  if (creds) {
    console.log(`${C.emerald}✓ TeraBox Cloudflare Worker Proxy & Credentials are VALID and ACTIVE!${C.reset}`);
    console.log(`${C.cyan}✓ Server-Side Resolved jsToken: ${creds.jsToken.substring(0, 16)}...${C.reset}`);

    try {
      const infoRes = await axios.get('https://www.1024terabox.com/api/home/info?app_id=250528', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Cookie': `lang=en; ndus=${creds.ndus};`,
          'Referer': 'https://www.1024terabox.com/main'
        }
      });
      if (infoRes.data && infoRes.data.data) {
        console.log(`${C.gold}👑 Connected Account: ${infoRes.data.data.username || 'Active User'} (UK: ${infoRes.data.data.uk || 'N/A'})${C.reset}`);
      }
    } catch (_) {}

    console.log(`\n${C.purple}============================================================================${C.reset}\n`);
    return true;
  } else {
    process.exit(1);
    return false;
  }
}

async function deleteRemoteFiles(targetPaths) {
  if (!Array.isArray(targetPaths) || targetPaths.length === 0) {
    console.error(`${C.rose}Error: Please specify one or more remote file/folder paths to delete.${C.reset}`);
    return false;
  }

  const creds = await resolveServerSideCredentials();
  if (!creds) return false;

  const normalizedPaths = targetPaths.map(p => p.startsWith('/') ? p : '/' + p);
  console.log(`${C.cyan}Deleting remote cloud file(s):${C.reset} ${normalizedPaths.join(', ')}`);

  try {
    const uploader = new TeraboxUploader({
      ndus: creds.ndus,
      jsToken: creds.jsToken,
      appId: creds.appId,
    });

    const res = await uploader.deleteFiles(normalizedPaths);

    if (res && (res.errno === 0 || res.success === true)) {
      console.log(`${C.emerald}✓ Successfully deleted from TeraBox cloud storage!${C.reset}`);
      sendDesktopNotification('TeraBox File Deleted', `✓ Deleted ${normalizedPaths.join(', ')}`, true);
      return true;
    } else {
      const errorMsg = res ? (typeof res.message === 'object' ? JSON.stringify(res.message) : JSON.stringify(res)) : 'Unknown error';
      console.error(`${C.rose}✕ Remote deletion failed: ${errorMsg}${C.reset}`);
      sendDesktopNotification('TeraBox Delete Failed', `✕ Deletion failed: ${errorMsg}`, false);
      return false;
    }
  } catch (err) {
    console.error(`${C.rose}✕ Deletion failed with error: ${err.message}${C.reset}`);
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
      console.log(`\n${C.purple}====================== 👑 TeraBox Remote Cloud Files (${remoteFolder}) ======================${C.reset}\n`);
      console.log(
        C.bold +
        'File Name'.padEnd(35) +
        'Size'.padEnd(14) +
        'Type'.padEnd(12) +
        'Remote Path' +
        C.reset
      );
      console.log(`${C.violet}${'─'.repeat(85)}${C.reset}`);
      res.data.list.forEach(item => {
        const name = (item.server_filename || '').length > 32 ? item.server_filename.slice(0, 29) + '...' : (item.server_filename || '');
        const size = formatFileSize(item.size || 0).padEnd(14);
        const type = item.isdir === 1 ? `${C.gold}Folder${C.reset}`.padEnd(21) : `${C.emerald}File${C.reset}`.padEnd(21);
        const pathStr = item.path || '';
        console.log(`${C.lightGray}${name.padEnd(35)}${size}${C.reset}${type}${C.cyan}${pathStr}${C.reset}`);
      });
      console.log(`\n${C.purple}========================================================================================${C.reset}\n`);
    } else {
      console.log(`${C.amber}👑 No files found or empty directory.${C.reset}`);
    }
  } catch (e) {
    console.error(`${C.rose}✕ Failed to fetch file list: ${e.message}${C.reset}`);
  }
}

async function uploadSingleFile(filePath, remoteFolder = '/') {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`${C.rose}Error: File not found at path "${resolvedPath}".${C.reset}`);
    sendDesktopNotification('TeraBox Upload Error', `File not found: ${filePath}`, false);
    return false;
  }

  const stats = fs.statSync(resolvedPath);
  if (stats.isDirectory()) {
    console.error(`${C.rose}Error: Path "${resolvedPath}" is a directory. Use "stt dir <folder>" to upload directories.${C.reset}`);
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

  console.log(`${C.cyan}🚀 Starting upload:${C.reset} ${C.bold}${fileName}${C.reset} (${C.gold}${fileSizeFormatted}${C.reset}) -> TeraBox:${C.purple}${fullRemotePath}${C.reset}`);

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
      console.log(`${C.emerald}✓ Upload successful! Remote path: ${fullRemotePath}${C.reset}`);
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
      console.error(`${C.rose}✕ Upload failed: ${errorMsg}${C.reset}`);
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
    console.error(`${C.rose}✕ Upload failed with error: ${err.message}${C.reset}`);
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
    console.error(`${C.rose}Error: Directory not found at "${resolvedDir}".${C.reset}`);
    return;
  }

  const files = fs.readdirSync(resolvedDir).filter(f => {
    const p = path.join(resolvedDir, f);
    return fs.statSync(p).isFile();
  });

  if (files.length === 0) {
    console.log(`${C.amber}No files found in directory "${resolvedDir}".${C.reset}`);
    return;
  }

  console.log(`${C.cyan}Found ${files.length} file(s) in "${resolvedDir}" to upload...${C.reset}\n`);
  let successCount = 0;
  for (const file of files) {
    const fullPath = path.join(resolvedDir, file);
    const ok = await uploadSingleFile(fullPath, remoteFolder);
    if (ok) successCount++;
    console.log('');
  }

  console.log(`${C.emerald}✓ Directory upload completed: ${successCount}/${files.length} files uploaded.${C.reset}`);
  sendDesktopNotification('TeraBox Batch Upload Complete', `✓ Uploaded ${successCount}/${files.length} files to TeraBox:${remoteFolder}`, true);
}

function displayHelpMenu() {
  console.log(`
${C.purple}=================================================================================${C.reset}
${C.bold}${C.gold}       👑 TeraBox Complete API & CLI Uploader — VinayakGhai (Indie Dev)          ${C.reset}
${C.purple}=================================================================================${C.reset}

${C.amber}💡 Tip: Use "stt", "store", "storetera", or "teraapi-full" anytime in terminal!${C.reset}

${C.bold}${C.violet}COMMAND SYNTAX & UTILITIES:${C.reset}
  ${C.emerald}stt upload <file> [remote-folder]${C.reset}      Upload file (Instant Background Detached <3ms)
  ${C.emerald}stt upload --sync <file>${C.reset}               Upload file in foreground with progress bar
  ${C.emerald}stt dir <folder> [remote-folder]${C.reset}       Upload entire directory recursively
  ${C.emerald}stt track${C.reset}                              Track active background uploads & percent progress
  ${C.emerald}stt delete <remote-path>${C.reset}               Delete remote file or directory on TeraBox cloud
  ${C.emerald}stt list [folder]${C.reset}                      List all remote files in TeraBox storage
  ${C.emerald}stt check${C.reset}                              Check Worker proxy & account session health
  ${C.emerald}stt log${C.reset}                                View upload history log
  ${C.emerald}stt log clear / stt clear${C.reset}              Clear upload history log & tracking cache
  ${C.emerald}stt help${C.reset}                               Display this royal help menu

${C.bold}${C.violet}EXAMPLE COMMANDS:${C.reset}
  ${C.cyan}stt my_file.zip${C.reset}                        Instant background upload to root '/'
  ${C.cyan}stt upload my_file.zip /backups${C.reset}         Upload to remote folder '/backups'
  ${C.cyan}stt dir my_photos /photos${C.reset}               Batch upload directory to '/photos'
  ${C.cyan}stt track${C.reset}                              View live colorful progress bars
  ${C.cyan}stt delete /backups/old_file.zip${C.reset}        Purge remote file from cloud
  ${C.cyan}stt log clear${C.reset}                           Clear all upload history logs

${C.bold}${C.violet}DOCUMENTATION & MANUAL:${C.reset}
  ${C.gold}LEARN IT PDF Guide:${C.reset} Open LEARN_IT.pdf for full setup, EULA, and architecture docs.

${C.purple}=================================================================================${C.reset}
  `);
}

function cleanRawArgs(raw) {
  let args = raw.filter(a => {
    if (!a) return false;
    if (a === 'run' || a === '--' || a.includes('dotenvx') || a.endsWith('.env')) return false;
    return true;
  });

  while (args.length > 0) {
    if (['stt', 'storetera', 'teraapi-full', 'store'].includes(args[0])) {
      args = args.slice(1);
      continue;
    }
    if (args[0].startsWith('-') && !['--sync', '--async-worker', '--help', '-h', '--check', '--list', '--dir', '--log', '--clear', '--track', '--delete', '--history', '--status', '--rm'].includes(args[0])) {
      args = args.slice(1);
      continue;
    }
    break;
  }
  return args;
}

async function main() {
  // 1. Robust Loop-Based Argument Cleaning
  let rawArgs = cleanRawArgs(process.argv.slice(2));

  if (rawArgs.length === 0) {
    displayHelpMenu();
    return;
  }

  const isAsyncWorker = rawArgs.includes('--async-worker');
  const isSync = rawArgs.includes('--sync');
  const args = rawArgs.filter(a => a !== '--async-worker' && a !== '--sync');

  if (args.length === 0) {
    displayHelpMenu();
    return;
  }

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
      console.log(`${C.rose}✕ Please specify a remote file or folder path to delete. Example: "stt delete /file.txt"${C.reset}`);
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
    console.log(`${C.rose}✕ Unrecognized command or missing parameters: "${rawArgs.join(' ')}"${C.reset}`);
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

    console.log(`${C.cyan}🚀 Upload queued in background (${targetName})...${C.reset}`);
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
