# TasksAI — Deployment Plan (M01)

**Status:** Plan; no production deploy yet. · **Date:** 2026-09-06

## Topology

TasksAI joins the existing Docker Compose + Caddy stack on the Hostinger VPS
(`82.25.116.73`), alongside the other apps. Three TasksAI containers:

| Container | Stage | Role |
|---|---|---|
| `tasksai` | `runner` | Next.js standalone server, port 3000 in-container |
| `tasksai-migrate` | `migrator` | one-shot `prisma migrate deploy`; runs to completion before `tasksai` starts |
| `tasksai-worker` | `worker` | BullMQ consumer (`tsx worker/index.ts`) |

Plus infrastructure it depends on:

| Service | Notes |
|---|---|
| `tasksai-postgres` | dedicated Postgres, **not** the platform DB. Local: host port 55438. Prod: internal network only. Volume `tasksai_pgdata`. |
| Redis | reuse the platform Redis instance; TasksAI uses its own key prefix via `bullmq` queue names (`tasksai.*`). |

## Caddy

Add a site block for `tasks-ai.asafarim.com` reverse-proxying to the
`tasksai` container. Same TLS + header setup as the other apps. Not enabled
until M01 is merged and a staging smoke passes.

## Env / secrets

- `TASKSAI_DATABASE_URL`, `AUTH_SECRET` (shared), `NEXT_PUBLIC_TASKSAI_URL`,
  `NEXT_PUBLIC_HUB_URL`, `TASKSAI_REDIS_URL` — from the encrypted
  `.env.production.age`.
- `NEXT_PUBLIC_TASKSAI_URL` is also a **build arg** (Next.js inlines it).
- The env contract (`lib/env.ts`) fails the boot if the database URL is
  missing or equals the platform `DATABASE_URL`.

## CI

`.github/workflows/tasksai-ci.yml` runs on changes to `apps/tasks-ai/**`,
`packages/auth/**`, `packages/ui/**`: typecheck, unit tests, auth registry
tests, and `prisma migrate deploy` against an ephemeral Postgres +
schema-vs-migrations drift check.

## Rollback

- App: redeploy the previous image tag.
- DB: migrations are additive in M01 (one `CREATE TABLE`). A down path is
  `DROP TABLE health_probe`; rehearsed via `scripts/migrate-rehearsal.sh`.

## Not done in M01

Prod Caddy block activation, prod DNS, first real deploy, monitoring
dashboards. Tracked for the M12 hardening milestone and the first staging
cut.

---

## Wired into production (follow-up, issue #226)

TasksAI is now part of the Docker Compose + Caddy prod stack:

- **`infra/caddy/Caddyfile`** — `tasks-ai.asafarim.com { reverse_proxy tasksai:3000 }`.
- **`docker-compose.prod.yml`** — `tasksai-postgres` (loopback `127.0.0.1:5438`, volume `tasksai_postgres_data`), one-shot `tasksai-migrate` (`target: migrator`), `tasksai-worker` (`target: worker`), `tasksai` (`target: runner`, port 3000). `NEXT_PUBLIC_TASKSAI_URL` added to the shared `&public-build-args`. `tasksai` added to Caddy's `depends_on`.
- **`infra/scripts/vps-deploy.sh`** — `tasksai-migrate tasksai-worker tasksai` appended to `BUILD_SERVICES`; `TASKSAI_DB_PASSWORD` added to `REQUIRED_VARS`. Migrations run automatically via `depends_on: service_completed_successfully` during `up -d`.

### Required in `.env.production` (add + re-encrypt `.env.production.age`)

| Var | Notes |
|---|---|
| `TASKSAI_DB_PASSWORD` | Postgres password for the dedicated `tasksai` DB. **Validated as required by the deploy script.** |
| `TASKSAI_DB_PASSWORD_URL` | URL-encoded form of the above (used in the connection string). |
| `NEXT_PUBLIC_TASKSAI_URL` | `https://tasks-ai.asafarim.com` (build arg + runtime). |
| `AUTH_SECRET` | already present (shared). |

Optional (features degrade gracefully without them): `ANTHROPIC_API_KEY`,
`OPENAI_API_KEY` (AI providers — default is the fixture), `STRIPE_SECRET_KEY`
/ `STRIPE_WEBHOOK_SECRET` (billing — closed by the licence gate anyway),
`TASKSAI_INBOUND_WEBHOOK_SECRET` (email capture route — 404s without it).

### DNS

Add an `A`/`AAAA` record for `tasks-ai.asafarim.com` → the VPS
(`82.25.116.73`) before the first deploy that includes these services;
Caddy will provision the TLS cert on first request.

### First-cut smoke

After deploy: `GET https://tasks-ai.asafarim.com/api/health` → `200` with
`{ "service": "tasks-ai", "checks": { "process": true, "database": true } }`;
SSO round trip from Hub; worker logs show `worker.ready` + periodic
`worker.health`.
