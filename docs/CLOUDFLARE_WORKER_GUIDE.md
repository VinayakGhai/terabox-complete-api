# Cloudflare Worker Deployment & Custom Subdomain Walkthrough

Step-by-step guide to deploying the **Terabox Complete API** token proxy
(`worker/index.js`) to Cloudflare Workers, pointing your CLI at it, setting
secrets, and (optionally) rate-limiting it.

---

## 1. What the Worker Does

The worker (`worker/index.js`) is a **server-side token proxy**:

- Resolves the TeraBox `jsToken` dynamically per request (never cached/stored).
- Accepts the session cookie three ways, in order of precedence:
  1. `x-terabox-ndus` request header
  2. `ndus=...` in a `Cookie` header
  3. the `TERABOX_NDUS` environment secret (fallback)
- Exposes health endpoints and proxies upload endpoints to TeraBox.

**Endpoints**

| Path | Purpose |
|---|---|
| `/health`, `/token`, `/check` | Resolve `jsToken` and report proxy health; returns `401` if the `ndus` cookie is expired/invalid |
| `/rest/*`, any path containing `/pcs/` | Proxied to `https://pcs.terabox.com` |
| everything else | Proxied to `https://www.terabox.com` with `jsToken` injected |

A resolved `jsToken` is appended as the `jsToken` query parameter on every
proxied request.

---

## 2. Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/) (free tier is fine).
- Node.js ≥ 18 and `npx wrangler` available.
- This repo cloned; `wrangler` is already a devDependency.

```bash
npx wrangler login
```

---

## 3. Configure `wrangler.toml`

The repo ships a minimal `wrangler.toml`:

```toml
name = "terabox-worker-proxy"
main = "worker/index.js"
compatibility_date = "2024-01-01"

[vars]
DEFAULT_APP_ID = "250528"
```

Change `name` if you want a different `<name>.workers.dev` hostname. Keep
`[vars]` for **non-secret** values only.

---

## 4. Set Secrets (never put cookies in source)

Store the TeraBox `ndus` session cookie as an **encrypted secret**, not in
`wrangler.toml` or source code:

```bash
npx wrangler secret put TERABOX_NDUS
# paste your ndus cookie when prompted
```

List / rotate secrets:

```bash
npx wrangler secret list
npx wrangler secret put TERABOX_NDUS     # overwrite to rotate
npx wrangler secret delete TERABOX_NDUS
```

> Note: because the CLI already sends `x-terabox-ndus` per request, the
> secret is a fallback. Still keep it protected.

---

## 5. Test Locally, Then Deploy

```bash
npm run worker:dev        # local dev server on :8787 (wrangler dev)

# smoke-test health locally
curl "http://127.0.0.1:8787/health" -H "x-terabox-ndus: <your-ndus>"

npm run worker:deploy     # or: npx wrangler deploy
```

After deploy your worker is live at:

```
https://terabox-worker-proxy.<your-subdomain>.workers.dev
```

Verify:

```bash
curl "https://terabox-worker-proxy.<your-subdomain>.workers.dev/health"
```

You should get `{"success":true,...}` with a resolved `jsToken`, or a `401`
JSON error if the cookie is invalid.

---

## 6. Point the CLI at Your Worker

Set `TERABOX_WORKER_URL` in the CLI's `.env` (see the
[CLI cheatsheet](CLI_CHEATSHEET.md)):

```bash
TERABOX_WORKER_URL=https://terabox-worker-proxy.<your-subdomain>.workers.dev
```

Then sanity-check the full chain:

```bash
stt check
```

---

## 7. Custom Routes & Subdomains

By default Workers gives you `<name>.<account>.workers.dev`. To serve the
proxy from your own domain/subdomain:

### Option A — Custom domain (managed on Cloudflare)

1. Cloudflare Dashboard → **Workers & Pages** → your worker → **Settings** →
   **Domains & Routes**.
2. **Add** → **Custom Domain**, choose e.g. `terabox.example.com`.
   Cloudflare creates the DNS record and issues a certificate automatically.
3. Update `TERABOX_WORKER_URL` to `https://terabox.example.com`.

### Option B — Route on an existing zone

1. In **Domains & Routes** → **Add** → **Route**.
2. Enter a route like `terabox.example.com/*` and pick your zone/worker.

### Wrangler CLI alternative

```bash
# custom domain
npx wrangler deployments   # inspect
# (custom domains/routes are managed in the dashboard or via the API)
```

> For `wrangler`, `routes` and `custom_domain` can also be declared under
> your environment in `wrangler.toml` (e.g. `[env.production.routes]`), but
> editing from the dashboard is the simplest one-time setup.

---

## 8. Rate Limiting

Protect the proxy from abuse. Cloudflare offers **Security → WAF → Rate
limiting rules** (Zone Rules). A sensible starting rule:

- **Expression**: `(http.request.uri.path matches "^/(token|rest|pcs)")`
- **Rate limit**: `120` requests per **10 minutes** per IP.
- **Action**: `Block` for 10 minutes when exceeded.

Steps:

1. Dashboard → your zone → **Security** → **WAF** → **Rate limiting rules**.
2. **Create rule**, give the expression above, set threshold/period/action.
3. Save.

Alternatively, use a simple in-worker counter via Cloudflare KV/Durable
Objects for finer control — but the zone-level rule is the easiest guard.

---

## 9. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `401 Missing TERABOX_NDUS cookie` | No header, no cookie, no secret. Set `x-terabox-ndus` or the `TERABOX_NDUS` secret. |
| `401 ... expired or invalid` | `ndus` cookie is stale. `stt` will auto-heal from the browser DB; or update the secret. |
| `Authentication failed: ... jsToken resolution failed` | Cookie valid but TeraBox rejected the token resolution; retry, or confirm the cookie is current. |
| `stt check` fails | Confirm `TERABOX_WORKER_URL` in `.env` matches the deployed URL exactly. |

---

## 10. Quick Checklist

- [ ] `wrangler login` done
- [ ] `wrangler.toml` has your worker `name`
- [ ] `TERABOX_NDUS` set via `wrangler secret put`
- [ ] `npm run worker:deploy` succeeded
- [ ] `curl <worker>/health` returns `success:true`
- [ ] `TERABOX_WORKER_URL` in CLI `.env` points at the worker
- [ ] `stt check` passes
- [ ] Custom domain/route (optional) + rate-limit rule (recommended)

See the [README](../README.md) for architecture and the
[Systemd guide](SYSTEMD_GUIDE.md) for running the CLI 24/7.
