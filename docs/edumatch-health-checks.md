# EduMatch: health checks, Caddy routing, and deploy environment

Tracks #162 (part of #89, "Launch readiness"). Lets an operator confirm
EduMatch is healthy in production without reading application source.

## Health check

**Endpoint**: `GET /api/status` — [`apps/edumatch/app/api/status/route.ts`](../apps/edumatch/app/api/status/route.ts).
Pings the shared platform database and reports real health, not just "the
process started":

```json
{ "app": "edumatch", "status": "ok", "db": "ok", "timestamp": "...", "responseTimeMs": 4 }
```

- `status`/`db`: `"ok"` if the DB ping succeeded, `"degraded"`/`"unreachable"`
  otherwise.
- **HTTP status** is `200` when healthy, **`503` when degraded** — this is
  what makes the endpoint usable as an actual healthcheck target (a `200`
  that merely *says* "degraded" in its body would look healthy to anything
  checking only the status code).
- **Unauthenticated by design.** It's allow-listed in
  [`apps/edumatch/proxy.ts`](../apps/edumatch/proxy.ts)'s `publicRoutes`
  (fixed alongside this doc — it was missing, so both the Docker healthcheck
  and the showcase proof board's cross-app live health check were silently
  getting `401`s and reporting EduMatch as unreachable regardless of actual
  health). See #167 for the same gap on other apps.

`/api/health` (also public) exists separately as a plain liveness probe (no
DB check) — used by nothing that needs a real health signal; `/api/status`
is the one to use for anything monitoring actual service health.

## Docker Compose health check

[`docker-compose.prod.yml`](../docker-compose.prod.yml)'s `edumatch` service:

```yaml
healthcheck:
  test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/api/status"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 20s
```

`wget` (not `curl`) because the runner image is `node:24-alpine` —
BusyBox's `wget` is present by default; `curl` is not. `--spider` makes wget
issue a request and check the response without downloading the body; it
exits non-zero on a non-2xx status, so the 503-on-degraded behavior above is
what actually makes this meaningful.

**Checking it**:

```bash
# Container-level status (healthy / unhealthy / starting)
docker inspect --format='{{json .State.Health.Status}}' <edumatch-container-id>

# Or via compose, which surfaces it in the STATUS column
docker compose -f docker-compose.prod.yml ps edumatch

# Full health-check log (last N attempts, useful for diagnosing flapping)
docker inspect --format='{{json .State.Health}}' <edumatch-container-id> | jq
```

Validate the Compose file itself parses and resolves cleanly (no build,
no containers started):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production config edumatch
```

## Caddy routing

[`infra/caddy/Caddyfile`](../infra/caddy/Caddyfile):

```caddy
edumatch.asafarim.com {
  reverse_proxy edumatch:3000 {
    transport http {
      read_timeout 600s
      write_timeout 600s
    }
  }
}
```

Matches the other 8 apps' pattern — a plain reverse proxy to the service's
internal Compose network name and port (`3000`, the same port the Docker
healthcheck targets and the Dockerfile's `EXPOSE`/`PORT` env var use).
Extended timeouts (600s vs Caddy's default) accommodate EduMatch's
AI-response streaming endpoints. No app in this platform uses Caddy's own
active `health_uri` reverse-proxy health checking yet — Caddy relies on
Docker's `restart: unless-stopped` policy plus its own passive
retry-on-failure behavior. Consistent with every other app; not something
this issue changes.

**Checking it**: `curl -I https://edumatch.asafarim.com/api/status` from
outside the VPS confirms both Caddy routing and the app's own health in one
request — a `200` means Caddy successfully proxied to a healthy EduMatch
container; anything else (`502`/`503`/timeout) means either Caddy can't
reach the container or the container is unhealthy, distinguishable by then
checking `docker compose ps edumatch` directly on the VPS.

## Environment variables required at deploy time

See [`docs/environment-management.md`](environment-management.md) for how
`.env.production` itself is managed (age-encrypted, `.env.production.age`
committed, decrypted at deploy time) — this section only lists which keys
EduMatch actually reads, compiled from `process.env.*` usage in
`apps/edumatch` and the shared `@asafarim/auth` package it depends on.

**Set directly in `docker-compose.prod.yml`** (not from `.env.production`):

| Variable | Value |
|---|---|
| `DATABASE_URL` | shared platform Postgres |
| `REDIS_URL` | `redis://redis:6379` (in-network) |
| `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_EDUMATCH_URL`, `AUTH_URL` | `https://edumatch.asafarim.com` |

**From `.env.production`** (shared across apps via `env_file:`):

| Variable | Used for |
|---|---|
| `AUTH_SECRET`, `AUTH_URL`, `AUTH_COOKIE_DOMAIN`, `AUTH_TRUST_HOST` | Auth.js session/cookie config (`@asafarim/auth`) |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google OAuth sign-in |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_SECURE`, `SMTP_REQUIRE_TLS`, `SMTP_BCC` | Email OTP sign-in and transactional mail (`@asafarim/auth`'s mailer) |
| `RESEND_API_KEY`, `FROM_EMAIL`, `NEXT_PUBLIC_RESEND_FROM_EMAIL` | EduMatch's own notification emails |
| `OPENAI_API_KEY`, `OPENAI_MODEL_CHAT`, `OPENAI_MODEL_VISION`, `OPENAI_MAX_TOKENS` | AI orchestrator, primary provider |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_MAX_TOKENS` | AI orchestrator, fallback provider |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_MOCK_MODE` | Payments/payouts (Stripe Connect) |
| `DO_SPACES_ENDPOINT`, `DO_SPACES_REGION`, `DO_SPACES_BUCKET`, `DO_SPACES_KEY`, `DO_SPACES_SECRET` | Attachment/avatar storage (DigitalOcean Spaces) |
| `GOOGLE_MAPS_API_KEY` | Location/geocoding for in-person tutoring |
| `UPSTASH_REDIS_REST_URL` | Alternative to `REDIS_URL` for the AI job queue (BullMQ) — only one of the two is needed |

Every one of these degrades gracefully rather than crashing the app if
unset in dev (see `lib/server/stripe.ts`, `lib/server/storage.ts`,
`lib/server/queue.ts` — each checks for its own config and falls back to a
stub/mock/disabled state). In production, missing a required one (Stripe,
storage, SMTP) means that *feature* is unavailable, not that the whole app
is down — `/api/status` only reflects database reachability, by design
(the things it checks are the platform-wide blocking dependency; a missing
`STRIPE_SECRET_KEY` is a configuration gap the operator needs to notice
some other way, e.g. by the payments feature visibly not working).
