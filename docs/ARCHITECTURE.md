# Architecture & Data Flow Breakdown

Detailed breakdown of the **Terabox Complete API** internals: the token
resolution lifecycle, the HTTP layer (axios) mechanics, the SQLite session
extractor algorithm, and the fallback/failover rules.

> Diagrams use [Mermaid](https://mermaid.js.org/), rendered inline on GitHub.

---

## 1. Component Topology

```mermaid
flowchart LR
    subgraph Local["Local Machine"]
        U[Terminal / cron] --> CLI["upload.js (CLI)"]
        CLI --> EX["extract_browser_creds.py"]
        DB[("Brave/Chrome SQLite Cookies")] --> EX
        EX --> ENV[".env (TERABOX_NDUS)"]
        ENV --> CLI
    end
    subgraph Edge["Cloudflare Worker"]
        W["worker/index.js (token proxy)"]
    end
    T1["www.terabox.com"] 
    T2["pcs.terabox.com"]

    CLI -- "GET /token, x-terabox-ndus" --> W
    W -- "resolve jsToken" --> T1
    W -- "forward upload requests" --> T1
    W -- "forward /rest/2.0/pcs/*" --> T2
    CLI -- "direct jsToken resolution" --> T1
```

There are two credential-resolution paths; the CLI prefers **direct
server-side resolution** against `www.1024terabox.com`, and the **worker**
acts as a proxy/token service the CLI also talks to for health checks
(`stt check`) and forwarding.

---

## 2. Token Resolution Lifecycle

`resolveServerSideCredentials(isRetry)` (`upload.js`) is the heart of auth.

```mermaid
sequenceDiagram
    autonumber
    participant CLI as upload.js
    participant Heal as extract_browser_creds.py
    participant Env as .env
    participant TB as 1024terabox.com

    CLI->>Env: read TERABOX_NDUS
    alt ndus missing or starts with "EXPIRED"
        alt not already retried
            CLI->>Heal: spawnSync python3 extract_browser_creds.py (5s timeout)
            Heal-->>CLI: fresh ndus (stdout)
            CLI->>Env: updateEnvFile(TERABOX_NDUS=fresh)
            CLI->>CLI: resolveServerSideCredentials(isRetry=true)
        else already retried
            CLI-->>CLI: fail — "Missing or invalid TERABOX_NDUS"
        end
    end
    CLI->>TB: GET /main  (Cookie ndus=..., UA, Referer)
    Note over TB: regex scan HTML for fn("jsToken")
    alt jsToken found
        TB-->>CLI: jsToken (30+ alnum chars)
        CLI-->>CLI: return {ndus, jsToken, appId, workerUrl}
    else no jsToken
        alt not retried
            CLI->>Heal: autoSelfHealNdusFromBrowser()
            CLI->>CLI: retry once with isRetry=true
        else retried
            CLI-->>CLI: fail — "session expired or invalid ndus"
        end
    end
```

Key points:

- **`isRetry` guard** ensures the browser self-heal runs at most **once** per
  resolution attempt (prevents infinite heal loops).
- The `jsToken` regex matches `fn%28%22<token>%22%29` (URL-encoded) or
  `fn("token")` in the `/main` HTML.
- Credentials are **never persisted locally**; `jsToken` is resolved fresh per
  run.

---

## 3. HTTP (axios) Layer Mechanics

The CLI configures **global axios defaults** once and uses a retry helper for
GETs:

```js
// upload.js — global defaults apply to every axios call
axios.defaults.headers.common['User-Agent']   = 'Mozilla/5.0 ... Chrome/128 ...';
axios.defaults.headers.common['Accept']       = 'application/json, ...';
axios.defaults.headers.common['Accept-Language'] = 'en-US,en;q=0.9';
axios.defaults.headers.common['Accept-Encoding'] = 'gzip, deflate, br';
axios.defaults.headers.common['Referer']      = 'https://www.1024terabox.com/main';
axios.defaults.headers.common['Connection']   = 'keep-alive';
```

`httpGetWithRetry(url, options, retries = 3)` wraps `axios.get` with
**exponential-ish backoff** (`300ms * (i+1)`) and rethrows on the final
attempt:

```mermaid
flowchart TD
    A[httpGetWithRetry i=0] -->|success| OK[return response]
    A -->|error| B{last attempt?}
    B -->|no| S["setTimeout 300*(i+1) ms"] --> A2["retry i+1"]
    A2 --> A
    B -->|yes| E[throw]
```

> The project does **not** use `axios.interceptors`; the equivalent behaviour
> (shared headers + retries) is achieved via global defaults + the retry
> helper. If you add interceptors later, this is the natural place.

The worker (`worker/index.js`) mirrors this for forwarded requests: it sets a
desktop-Chrome `User-Agent`, injects `Cookie: lang=en; ndus=...;`, strips
`x-terabox-ndus` and `host` before forwarding, and uses a **4s AbortSignal**
timeout around `jsToken` resolution.

---

## 4. Request Flow — Upload

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant CLI as upload.js
    participant Up as TeraboxUploader (terabox-upload-tool)
    participant TB as TeraBox PCS

    User->>CLI: stt upload file /folder
    CLI->>CLI: resolveServerSideCredentials()
    CLI->>CLI: stat(file), normalise target path
    alt file is a directory
        CLI-->>User: error — use "stt dir"
    end
    CLI->>CLI: detach to background (<3ms), set TERABOX_TASK_ID
    CLI->>Up: new TeraboxUploader({ndus, jsToken, appId})
    CLI->>TB: /api/precreate  (chunk allocation)
    TB-->>Up: block list
    loop each chunk
        Up->>TB: /rest/2.0/pcs/superfile2  (upload part)
        Up-->>CLI: progressCallback(percent)
    end
    Up->>TB: create file (combine parts)
    TB-->>Up: {success}
    Up-->>CLI: result
    CLI->>CLI: updateTaskState(SUCCESS) + appendHistory()
    CLI-->>User: desktop notification (auto-dismiss 2s)
```

- **Background detach**: by default the upload forks to the background
  instantly; `TERABOX_TASK_ID` keys the task state so `stt track` can poll it.
- `--sync` keeps the process in the foreground instead.
- History is appended to `~/.terabox_history.json` on both success and failure.

---

## 5. SQLite Session Extractor Algorithm

`extract_browser_creds.py` recovers a fresh `ndus` cookie from the local
browser in ~0.05s with no window.

```mermaid
flowchart TD
    A[Locate Cookies DB] --> P{path exists?}
    P -->|Brave default| OK
    P -->|Chrome default| OK
    P -->|Chromium default| OK
    P -->|none found| F[return None]
    OK[Copy DB to /tmp copy] --> Q["SELECT host_key,name,encrypted_value<br/>WHERE host_key LIKE '%terabox%' AND name='ndus'"]
    Q --> K[Get master key via SecretStorage DBus]
    K --> D1["PBKDF2-HMAC-SHA1(salt=saltysalt, iter=1, len=16)"]
    D1 --> D2["AES-CBC decrypt (iv=16 spaces)"]
    D2 --> R[strip v10/v11 prefix]
    R --> X["regex [a-zA-Z0-9_-]{20,} -> candidates"]
    X --> Pri{host == .terabox.com?}
    Pri -->|yes| RT[return that token]
    Pri -->|no| RT2[return first candidate]
    RT --> CL[delete /tmp copy]
    RT2 --> CL
```

Details:

- **DB candidates** checked in order: Brave → Google Chrome → Chromium
  (`Default/Cookies`).
- **Master key** comes from the OS keyring via `secretstorage`
  (items labelled `Brave/Chrome/Chromium Safe Storage`; default fallback
  `b'peanuts'`).
- **KDF**: `PBKDF2HMAC(SHA1, salt=b'saltysalt', iterations=1, length=16)`.
- **Cipher**: AES-128-CBC, `iv = 16 × b' '`; ciphertext prefix `v10`/`v11`
  is stripped first.
- The DB is **copied to `/tmp`** before opening so it works while the browser
  is running (SQLite lock), and the copy is removed afterwards.
- Token selection prefers `.terabox.com`/`terabox.com` hosts, truncating
  >40-char candidates to their last 40 chars.

---

## 6. Fallback & Failover Rules

```mermaid
flowchart TD
    S[resolveServerSideCredentials] --> V{ndus valid?}
    V -->|missing / EXPIRED*| H1[attempt self-heal ONCE]
    H1 -->|fresh cookie| S2[retry resolution isRetry=true]
    H1 -->|failed| X1[fail: invalid TERABOX_NDUS]
    V -->|ok| G[GET /main, 10s timeout, 3 retries]
    G -->|200 + jsToken| DONE[credentials ready]
    G -->|200 no jsToken| H2[attempt self-heal ONCE]
    H2 -->|ok| S2
    H2 -->|fail| X2[fail: session expired / invalid ndus]
    G -->|network error| H3[attempt self-heal ONCE]
    H3 -->|ok| S2
    H3 -->|fail| X3[fail: token resolution error]
```

Summary of the rules, in priority order:

1. **Reuse local `ndus`** from `.env` if present and not `EXPIRED*`.
2. **Self-heal once** (`extract_browser_creds.py`) and update `.env` +
   `process.env` in place; then re-run resolution with `isRetry=true`.
3. **`httpGetWithRetry`** gives 3 HTTP attempts with backoff before treating
   the call as failed.
4. **Never re-heal more than once** per resolution (guards against loops).
5. **Worker fallback for secrets**: the worker uses the `TERABOX_NDUS` secret
   only if no `x-terabox-ndus` header / cookie was sent, and returns `401`
   when resolution fails so the CLI knows to self-heal.
6. **Host routing on the worker**: `/rest/*` or `/pcs/` → `pcs.terabox.com`;
   everything else → `www.terabox.com`.

---

## 7. State, History & Telemetry

| Concern | Storage | Notes |
|---|---|---|
| Session cookie | `.env` (`TERABOX_NDUS`) | refreshed in-place by self-heal |
| Upload history | `~/.terabox_history.json` | appended on success & failure; `stt log` / `stt clear` |
| Async task state | keyed by `TERABOX_TASK_ID` | `stt track` shows live progress |
| Notifications | OS desktop notification | auto-dismiss ~2s |

No `jsToken` is stored. Health checks (`stt check`) additionally hit
`/api/home/info` to confirm the connected account username/uk.

---

## See also

- [README](../README.md) — install, one-liner, high-level flow.
- [CLI Cheatsheet](CLI_CHEATSHEET.md) — all commands & flags.
- [Cloudflare Worker Guide](CLOUDFLARE_WORKER_GUIDE.md) — deploy the proxy.
- [Systemd Guide](SYSTEMD_GUIDE.md) — 24/7 operation.
