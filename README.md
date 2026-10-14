# YAPA Task Dashboard

A **read-only**, near-real-time web dashboard for [YAPA](https://github.com/vuldin/yapa) tasks
across the whole team. It reads from the YAPA sync service (the same Cloud Run service the
YAPA plugin syncs through). Run it locally signed in as you, or deploy it to Cloud Run behind
IAP so anyone in the company can open a URL, sign in with Google, and watch tasks update live.
It never writes: create, update and complete tasks through Claude Code (YAPA MCP) as usual.

**Redpanda colleagues:** this dashboard is already deployed internally, so there's nothing to
install. Reach out to [@vuldin](https://github.com/vuldin) for the URL; you sign in with your
company Google account.

## Features
- Tasks from **every user** in shared collections, with a **person** filter (by task owner,
  i.e. the server-assigned `origin_user`). Teammate edits show as "✎ <editor>" in the Owner column.
- Defaults to **open** tasks (status != complete); also **All** and **Closed by week** views.
- Filter by status, person, one or more collections (with customer/project shortcuts) and
  minimum priority (e.g. "high or higher"); sort by due or created date.
- Live updates over Server-Sent Events (backend pulls the service's change feed + diffs).
- **Closed by week**: bar chart of tasks closed per ISO week (by `completed_at`, falling back
  to `updated_at`), plus a per-week list.

## What it can't see
Local-only collections (`global`, `private-*`, `local-*`) never leave each person's machine,
so they are not on the service and not on this dashboard. Your own unsynced local edits show
up once the plugin pushes them (usually within seconds of the write).

## Architecture
- `server/` — Fastify backend (port **8787**). Every ~15s it lists the service's collections and
  pulls each one's change feed (`GET /v1/collections/{c}/documents`, no embeddings). The first
  pull reads full history; later pulls start from the newest row seen minus a 120s overlap, and
  apply the deletions feed. Changes are diffed against a content-hashed snapshot and pushed
  over `/api/stream`. REST: `/api/tasks` (`?owner=`, `?collection=` repeatable, ...), `/api/collections`,
  `/api/health`.
- `web/` — Vite + React + TS SPA (port **5173**). TanStack Query holds the canonical task set;
  SSE patches it in place. TanStack Table grid, Recharts chart, Zustand UI state, Tailwind v4.
- `shared/` — task types, metadata decoding (mirrors YAPA's `fromChroma`), ISO-week helpers.

## Sign-in

| | Viewer sign-in (`AUTH_MODE`) | Backend reads yapa-service as (`YAPA_SYNC_ID_TOKEN_SOURCE`) |
|--|--|--|
| **Local** (default off Cloud Run) | `local`: no gate; the viewer is you | `command`: `gcloud auth print-identity-token` (your account) |
| **Cloud Run** (default when `K_SERVICE` is set) | `iap`: IAP signs each request with `x-goog-iap-jwt-assertion`, and the app verifies it (signature, `iss`, `aud` = `IAP_AUDIENCE`, optional `IAP_ALLOWED_HD`). No valid assertion means 401 on every route except `/healthz`. | `metadata`: the runtime service account's ID token (`aud` = `YAPA_SYNC_ID_TOKEN_AUDIENCE`), listed in yapa-service's `YAPA_READER_PRINCIPALS`, which makes it read-only there too |

`AUTH_MODE=local` is refused on Cloud Run. When an IAP session expires, the page reloads so IAP
can send you through Google sign-in again.

## Run
```bash
gcloud auth login   # once, with your company account (same as the YAPA plugin)
npm install
npm run dev         # server :8787 + vite :5173 (open http://localhost:5173)
npm test            # IAP assertion, filter and collection-picker tests
```
For a production-style run, `npm run build && npm run build:server && npm start` serves the
API and the built SPA from one origin (`STATIC_DIR`, default `web/dist`). `npm run start:dev`
runs the server from source.

## Deploy (Cloud Run behind IAP)
`Dockerfile` builds a single image (API + SPA). `infra/` has the Terraform and
`infra/deploy.sh`; see [infra/README.md](infra/README.md).

## Config (env)
| Var | Default |
|-----|---------|
| `YAPA_SYNC_SERVICE_URL` | the yapa plugin's `sync_service_url` from `~/.claude/settings.json` |
| `YAPA_SYNC_ID_TOKEN_SOURCE` | `metadata` on Cloud Run, else `command` |
| `YAPA_SYNC_ID_TOKEN_CMD` | `gcloud auth print-identity-token` |
| `YAPA_SYNC_ID_TOKEN_AUDIENCE` | `YAPA_SYNC_SERVICE_URL` (`metadata` tokens only; must be in yapa-service's `YAPA_AUDIENCES`) |
| `STATIC_DIR` | `web/dist` (served when it exists) |
| `AUTH_MODE` | `iap` on Cloud Run, else `local` |
| `IAP_AUDIENCE` | required for `iap`: `/projects/<number>/locations/<region>/services/<name>` |
| `IAP_ALLOWED_HD` | unset (optional extra Workspace-domain check) |
| `HOST` | `0.0.0.0` on Cloud Run, else `127.0.0.1` |
| `YAPA_DEVICE_ID` | `task-dashboard` (sent as `X-Yapa-Device`; labels requests only) |
| `POLL_INTERVAL_MS` | `15000` |
| `PULL_OVERLAP_SECONDS` | `120` |
| `PULL_CONCURRENCY` | `6` |
| `PORT` | `8787` |

Each poll costs one request per collection (~50) against your per-user service rate limit
(20 req/s, burst 100), which the YAPA plugin shares. Don't set the interval much lower.

## Data dependency
The "Closed by week" grouping uses YAPA's stable `completed_at` on completed tasks; older
completed tasks without it fall back to `updated_at`.
