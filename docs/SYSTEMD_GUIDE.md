# Systemd Service & Auto-Start Configuration Guide

Run the **Terabox Complete API** local worker proxy 24/7 with a systemd
**user** unit, keep it alive across reboots and logouts via **lingering**,
auto-start the desktop app under Wayland/X11 window managers, and rotate logs.

The repo ships a ready-made template: [`systemd/terabox-worker.service`](../systemd/terabox-worker.service).

```ini
[Unit]
Description=TeraBox Cloudflare Worker Local Proxy
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/nayak-indie
ExecStart=/usr/bin/npx wrangler dev --port 8787
Restart=always
RestartSec=3
StandardOutput=null
StandardError=null

[Install]
WantedBy=default.target
```

> Before enabling, edit `WorkingDirectory` to **your** checkout path and make
> sure `wrangler` is reachable (global npm install recommended over `npx`).

---

## 1. Install & enable the user service

```bash
# 1. Copy the template into your user unit dir
mkdir -p ~/.config/systemd/user
cp systemd/terabox-worker.service ~/.config/systemd/user/

# 2. Point WorkingDirectory at your checkout (edit the copied file)
sed -i "s|^WorkingDirectory=.*|WorkingDirectory=$PWD|" \
  ~/.config/systemd/user/terabox-worker.service

# 3. Reload + enable + start
systemctl --user daemon-reload
systemctl --user enable --now terabox-worker.service

# 4. Let it run even when you are logged out
loginctl enable-linger $USER
```

Verify:

```bash
systemctl --user status terabox-worker.service
curl -s http://127.0.0.1:8787/health
```

Point the CLI at the local proxy (`TERABOX_WORKER_URL=http://127.0.0.1:8787`
in `.env`), then `stt check`.

### Use the global wrangler (recommended)

`npx` downloads on first use and can hang. Prefer a global install:

```bash
npm install -g wrangler
# then use:
ExecStart=/usr/bin/env wrangler dev --port 8787
```

`systemctl --user daemon-reload` + `systemctl --user restart terabox-worker`
after editing.

---

## 2. Linger (survive logout)

A user unit normally stops when you log out. Enable lingering so it starts at
boot and survives logouts:

```bash
loginctl enable-linger $USER
loginctl show-user $USER | grep Linger   # -> Linger=yes
```

To disable: `loginctl disable-linger $USER`.

---

## 3. Auto-start for Wayland / X11 window managers

The worker proxy is headless (the systemd unit above covers it **before** any
session starts). If you also want the **desktop app / UI** to auto-launch when
your graphical session starts, use your WM's autostart mechanism:

### Hyprland (Wayland)

Add to `~/.config/hypr/hyprland.conf`:

```ini
exec-once = systemctl --user start terabox-worker.service
# and/or launch a UI after the worker is up:
exec-once = sleep 2 && <your-desktop-command>
```

### Sway (Wayland)

In `~/.config/sway/config`:

```
exec systemctl --user start terabox-worker.service
```

### i3 (X11)

In `~/.config/i3/config`:

```
exec --no-startup-id systemctl --user start terabox-worker.service
```

### AwesomeWM (Lua)

In `~/.config/awesome/rc.lua`:

```lua
awful.spawn.with_shell("systemctl --user start terabox-worker.service")
```

> With lingering enabled, the worker is usually already running before the
> WM starts, so these lines are belt-and-braces; the `systemctl` start is
> idempotent.

---

## 4. Log rotation

The shipped template discards output (`StandardOutput=null`). For debugging,
redirect to journal or a file instead, then rotate.

### Option A — journal (simplest)

```ini
[Service]
StandardOutput=journal
StandardError=journal
```

Then inspect with `journalctl --user -u terabox-worker -f`. The journal
auto-rotates (see `SystemMaxUse=` in `/etc/systemd/journald.conf`).

### Option B — file + logrotate

```ini
[Service]
StandardOutput=append:/home/%u/.terabox-worker.log
StandardError=append:/home/%u/.terabox-worker.log
```

> `%u` expands to the user. `append:`/`truncate:` require systemd ≥ 240.

Create `/etc/logrotate.d/terabox-worker` (root required):

```
/home/*/.terabox-worker.log {
    daily
    rotate 7
    compress
    missingok
    notifempty
    copytruncate
}
```

`copytruncate` avoids needing a restart to reopen the file. Test with
`sudo logrotate -d /etc/logrotate.d/terabox-worker`.

---

## 5. Operations cheat-sheet

```bash
systemctl --user status  terabox-worker.service   # health
systemctl --user restart terabox-worker.service   # restart
systemctl --user stop    terabox-worker.service   # stop
systemctl --user disable terabox-worker.service   # don't start at boot
journalctl --user -u terabox-worker -n 50         # recent logs (journald)
journalctl --user -u terabox-worker -f            # follow logs
```

---

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| `Failed to connect to bus` | You're not in a user session, or lingering isn't set up. Log in normally first. |
| Service starts then dies | `Wrangler not found` — use `npm i -g wrangler` and `ExecStart=/usr/bin/env wrangler dev --port 8787`. Check `journalctl --user -u terabox-worker`. |
| `WorkingDirectory` wrong | Edit the copied unit, `daemon-reload`, `restart`. Must be the repo root. |
| Stops on logout | `loginctl enable-linger $USER`. |
| Port 8787 busy | Another instance running; `systemctl --user stop terabox-worker` or change `--port`. |

---

## See also

- [README](../README.md) — Option B (local systemd) install snippet.
- [Cloudflare Worker Guide](CLOUDFLARE_WORKER_GUIDE.md) — deploy to the edge
  instead (Option A; no local service needed).
- [CLI Cheatsheet](CLI_CHEATSHEET.md) — `stt check` / worker commands.
