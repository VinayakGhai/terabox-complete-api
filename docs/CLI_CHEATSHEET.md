# CLI Cheatsheet & Shell Integration Guide

Complete command reference for the **Terabox Complete API** CLI
(`teraapi-full` / `storetera` / `stt`), including remote-folder targeting,
environment variables, and shell completion snippets.

---

## 1. Invoking the CLI

After a global install the same entry point (`upload.js`) is exposed under
three names — they are fully interchangeable:

```bash
teraapi-full <command>   # canonical name
storetera <command>      # short alias
stt <command>            # shortest alias
```

If you run from a source checkout instead of a global install, prefix with
Node, or alias it in your shell rc file:

```bash
# ~/.bashrc or ~/.zshrc
alias storetera="node /path/to/terabox-complete-api/upload.js"
alias stt="node /path/to/terabox-complete-api/upload.js"
```

---

## 2. Command Reference

| Command | Alias | Description | Mode |
|---|---|---|---|
| `stt upload <file> [folder]` | `storetera upload <file>` | Upload a single file | Instant background (<3ms) |
| `stt upload --sync <file>` | | Upload in the foreground terminal | Foreground |
| `stt dir <folder> [remote-folder]` | `storetera dir` | Upload a directory recursively | Instant background |
| `stt track` / `stt status` | `storetera track` | Show live active uploads & progress bars | Process monitor |
| `stt list [folder]` / `stt ls` | `storetera list` | List remote files in TeraBox storage | Cloud file manager |
| `stt delete <path>...` / `stt rm <path>...` | `storetera delete` | Purge remote file(s)/folder(s) (accepts multiple paths) | Remote file manager |
| `stt check` | `storetera check` | Verify worker proxy & session health | Health check |
| `stt log` / `stt history` | `storetera log` | View formatted upload history (`~/.terabox_history.json`) | History viewer |
| `stt log clear` / `stt clear` | `storetera clear` | Clear local upload history log | Log manager |
| `stt track clear` | | Clear active-track state | Log manager |
| `stt help` / `stt --help` / `stt -h` | | Show the interactive help menu | Help |

Bare path shortcuts also work — a first argument that is not a known command
is treated as an upload:

```bash
stt ./report.pdf            # upload to remote / 
stt ./report.pdf /invoices  # upload to remote /invoices
```

### Global flags

| Flag | Effect |
|---|---|
| `--sync` | Block the terminal until the upload finishes (foreground mode) |
| `--async-worker` | Force the async background detach path even for default sync calls |

---

## 3. Custom Remote Folder Targeting

Most commands take an optional remote path. Paths may be written with or
without a leading `/` — the CLI normalises them:

```bash
# upload a file into a custom folder
stt upload backup.tar.gz /backups

# upload a whole directory tree into a project folder
stt dir ./website /projects/website

# list a specific folder
stt list /backups

# delete several remote targets at once
stt delete /backups/old-1.tar.gz /backups/old-2.tar.gz
```

Folder structure is preserved on directory uploads, and history is logged to
`~/.terabox_history.json`.

---

## 4. Environment Variables

The CLI reads its configuration from a `.env` file (dotenv) next to
`upload.js`. Recognised variables:

| Variable | Used by | Purpose |
|---|---|---|
| `TERABOX_NDUS` | CLI + Worker | TeraBox session cookie. Auto-healed from your local Brave/Chrome SQLite store in <0.05s when it expires — the `.env` is updated in place. |
| `TERABOX_WORKER_URL` | CLI | URL of your deployed Cloudflare Worker token proxy (e.g. `https://your-worker.workers.dev`). |
| `TERABOX_APPID` | CLI | TeraBox app id used for the upload API requests. |
| `TERABOX_TASK_ID` | CLI | Internal task id used to track async background uploads. |
| `ENV_PATH` | CLI | Override the `.env` file location. |

The worker (`worker/index.js`) expects `TERABOX_NDUS` as a **secret**, never
hard-coded (see §5).

> 🛡️ Security: never commit `.env` or paste `TERABOX_NDUS` anywhere public.
> The `jsToken` itself is resolved server-side by the worker and is never
> stored locally.

---

## 5. Worker commands

```bash
npm run worker:dev      # local wrangler dev server on :8787
npm run worker:deploy   # deploy to Cloudflare
```

Set the session cookie as a worker secret, not in source:

```bash
npx wrangler secret put TERABOX_NDUS
```

---

## 6. Shell Completion

The CLI uses plain positional arguments, so completion is best wired by
completing commands + local paths. Drop the snippet for your shell into your
rc file.

### Bash (`~/.bashrc`)

```bash
_stt_complete() {
  local commands="upload dir track status list ls delete rm check log history clear help"
  local cur="${COMP_WORDS[COMP_CWORD]}"
  if [[ $COMP_CWORD -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "$commands" -- "$cur") )
  else
    COMPREPLY=( $(compgen -f -- "$cur") )   # complete file paths
  fi
}
complete -F _stt_complete stt storetera teraapi-full
```

### Zsh (`~/.zshrc`)

```zsh
#compdef stt storetera teraapi-full  (save as _stt under $fpath, or eval inline)
_stt() {
  local -a commands
  commands=(
    'upload:Upload a single file'
    'dir:Upload a directory recursively'
    'track:Show live upload progress'
    'status:Show live upload progress'
    'list:List remote files'
    'ls:List remote files'
    'delete:Delete remote files'
    'rm:Delete remote files'
    'check:Verify worker proxy & session health'
    'log:View upload history'
    'history:View upload history'
    'clear:Clear upload history'
    'help:Show help'
  )
  if (( CURRENT == 2 )); then
    _describe 'command' commands
  else
    _files
  fi
}
compdef _stt stt storetera teraapi-full
```

### Fish (`~/.config/fish/completions/stt.fish`)

```fish
complete -c stt -c storetera -c teraapi-full -n __fish_use_subcommand \
  -a "upload dir track status list ls delete rm check log history clear help" \
  -d "Terabox Complete API"
complete -c stt -c storetera -c teraapi-full -n "__fish_seen_subcommand_from upload dir" \
  -F    # complete local files for upload/dir
```

> Note: the short global aliases referenced in some issue trackers
> (`store`, `store_dir`, `store_log`, `store_check`, `store_clear`) are
> convenience aliases for the subcommands above — `stt upload`, `stt dir`,
> `stt log`, `stt check`, `stt clear`. Prefer the canonical `stt <command>`
> form shown in §2.

---

## 7. Quick Recipes

```bash
# Health-check the worker + session before a big job
stt check

# Nightly backup of a folder (foreground so cron captures output)
stt upload --sync ~/projects/site.tar.gz /backups

# Watch live progress bars
stt track

# What did I upload recently?
stt log

# Clean slate
stt clear
```

See the [README](../README.md) for installation and the
[Systemd guide](SYSTEMD_GUIDE.md) for 24/7 background operation.
