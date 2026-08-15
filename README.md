<p align="center">
  <img src="assets/logo.jpg" alt="Terabox Complete API Banner" width="800" style="border-radius: 8px;"/>
</p>

<h1 align="center">Terabox Complete API</h1>

<p align="center">
  <b>Production-Grade TeraBox CLI File Uploader & Cloudflare Worker Server-Side Token Proxy</b>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-GPL--2.0-blue.svg" alt="GPLv2 License"/></a>
  <img src="https://img.shields.io/badge/Node.js-v18%2B-green.svg" alt="Node.js Version"/>
  <img src="https://img.shields.io/badge/Cloudflare_Worker-Server--Side_Token-orange.svg" alt="Cloudflare Worker"/>
  <img src="https://img.shields.io/badge/Playwright-Removed-red.svg" alt="No Playwright"/>
</p>

---

## Overview

**Terabox Complete API** is a complete, high-performance CLI file uploader for TeraBox paired with a Cloudflare Worker token proxy. It eliminates browser window popups, removes heavy Playwright dependencies, and solves TeraBox token expiration through server-side `jsToken` resolution and silent background `ndus` session self-healing.

---

## Key Features

- ⚡ **Server-Side `jsToken` Resolution**: `jsToken` is **NEVER** stored, extracted, or cached locally. The Cloudflare Worker resolves it dynamically per request server-side.
- 🛡️ **Seamless Background Session Self-Healing**: If `.env`'s `TERABOX_NDUS` session cookie ever expires, the CLI automatically extracts the active session cookie directly from your local Brave/Chrome SQLite store in **0.05 seconds** in the background and resumes your upload without interruption.
- 🚫 **Zero Playwright / Zero Window Disruption**: No Chromium profile overhead, no browser popups, and no focus stealing on tiling window managers (i3, Hyprland, Sway, AwesomeWM).
- ⚙️ **Systemd 24/7 Service**: Ships with a pre-configured `systemd` user service template for 24/7 background proxy operation across system reboots.
- 📁 **Single & Batch Directory Uploads**: Seamless progress tracking, history logging (`~/.terabox_history.json`), and folder structure preservation.

---

## Architecture Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as Terminal User
    participant CLI as upload.js (Local CLI)
    participant Healer as extract_browser_creds.py
    participant Worker as Cloudflare Worker Proxy
    participant TeraBox as TeraBox Servers

    User->>CLI: store <file> <remote-folder>
    CLI->>Worker: GET /token (x-terabox-ndus)
    alt ndus Expired or Invalid
        Worker-->>CLI: 401 Unauthorized
        CLI->>Healer: Exec extract_browser_creds.py (<0.05s)
        Healer-->>CLI: Fresh ndus from Brave/Chrome DB
        CLI->>CLI: Update .env in-place
        CLI->>Worker: Retry GET /token
    end
    Worker->>TeraBox: Resolve jsToken server-side
    Worker-->>CLI: 200 OK (jsToken resolved)
    CLI->>Worker: Forward Chunked Upload (/api/precreate, /rest/2.0/pcs/file)
    Worker->>TeraBox: Forward Upload Requests with Cookies & jsToken
    TeraBox-->>Worker: 200 OK (Upload Complete)
    Worker-->>CLI: 200 OK (Upload Complete)
    CLI-->>User: ✓ Upload Successful
```

---

## Installation & Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/terabox-complete-api.git
cd terabox-complete-api
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Setup Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Edit `.env` and set your `TERABOX_NDUS` cookie value:
```env
TERABOX_NDUS=your_ndus_cookie_here
TERABOX_WORKER_URL=http://localhost:8787
```

### 4. Deploy or Run Worker Proxy

#### Option A: Cloudflare Worker Deployment (Recommended)
Deploy directly to Cloudflare's global edge network (runs 24/7 for free with zero local background processes):
```bash
npm run worker:deploy
```
Set `TERABOX_WORKER_URL` in `.env` to your deployed `*.workers.dev` URL.

#### Option B: Local Systemd Background Service
Enable the pre-configured systemd service to run the worker locally in the background on boot:
```bash
mkdir -p ~/.config/systemd/user
cp systemd/terabox-worker.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now terabox-worker.service
loginctl enable-linger $USER
```

---

## CLI Shell Commands Reference

Add these aliases to your `~/.bashrc` or `~/.zshrc`:

```bash
alias store="node /path/to/terabox-complete-api/upload.js"
alias store_dir="node /path/to/terabox-complete-api/upload.js --dir"
alias store_log="node /path/to/terabox-complete-api/upload.js --log"
alias store_check="node /path/to/terabox-complete-api/upload.js --check"
alias store_clear="node /path/to/terabox-complete-api/upload.js --clear-log"
```

| Command | Usage | Description |
|---|---|---|
| `store` | `store <file-path> [remote-folder]` | Upload a single file to TeraBox |
| `store_dir` | `store_dir <folder> [remote-folder]` | Upload all files in a directory |
| `store_check` | `store_check` | Verify Worker proxy health and session credentials |
| `store_log` | `store_log` | View formatted upload history log |
| `store_clear` | `store_clear` | Clear local upload history log |

---

## Credits & Acknowledgments

This project synthesizes ideas and technical patterns from the following open-source projects (forked accountably under [@VinayakGhai](https://github.com/VinayakGhai)):

1. **[`saahiyo/terabox-gateway`](https://github.com/saahiyo/terabox-gateway)** *(Forked: [`VinayakGhai/terabox-gateway`](https://github.com/VinayakGhai/terabox-gateway))*
   - *Inspired Pattern*: Cloudflare Worker server-side `jsToken` resolution and API proxy architecture.
2. **[`Pahadi10/terabox-upload-tool`](https://github.com/Pahadi10/terabox-upload-tool)** *(Forked: [`VinayakGhai/terabox-upload-tool`](https://github.com/VinayakGhai/terabox-upload-tool))*
   - *Inspired Pattern*: Node.js chunk allocation (`/api/precreate`), PCS upload (`/rest/2.0/pcs/file`), and file creation pipeline.

---

## License

This project is licensed under the **GNU General Public License v2.0 (GPL-2.0)**. See the [LICENSE](LICENSE) file for details.
