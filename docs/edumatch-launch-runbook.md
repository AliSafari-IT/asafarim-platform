# EduMatch: launch runbook

Tracks #163 (part of #89, "Launch readiness"). Deploy steps, pre-launch
checklist, and post-deploy smoke checks for shipping EduMatch changes to
`edumatch.asafarim.com`. Companion to
[`docs/edumatch-rollback-runbook.md`](edumatch-rollback-runbook.md).

## How a deploy actually works

There is no image registry or version tagging — every deploy rebuilds all
13 app images **from source**, straight off `main`. "Deploying an older
version" means checking out an older commit and rebuilding, not swapping an
image tag (see the rollback runbook).

1. A push to `main` triggers [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)
   (or `workflow_dispatch` for a manual redeploy without a new commit).
2. That workflow SSHes into the VPS and runs
   [`infra/scripts/vps-deploy.sh`](../infra/scripts/vps-deploy.sh), which:
   - `git reset --hard origin/main` (tracked files only — `.env.production`
     and `.age/` are untouched)
   - decrypts `.env.production` from the committed `.env.production.age`
   - validates a handful of required env vars are non-blank, refusing to
     deploy rather than silently starting containers with a blank
     `DATABASE_URL`/similar (see the script's own comment on
     `TIMELINEAI_GUEST_IP_HASH_KEY` for the failure mode this guards
     against)
   - checks disk space and prunes images/build cache if needed (13 images
     built sequentially is the single biggest disk consumer on the VPS)
   - builds all 13 app images sequentially (memory-safe on the VPS's 8GB)
   - runs `platform-migrate` (Prisma `migrate deploy` against the shared
     database) — **before** touching any running app container. If this
     fails, the deploy aborts and the previous release keeps running
     untouched (see the rollback runbook for what to do if you land here)
   - `docker compose up -d --remove-orphans`, then force-recreates Caddy
   - posts a Discord notification if `WEBHOOK_SECRET_DISCORD` is set
   - prints `docker compose ps` as the final line of output

## Pre-launch checklist

- [ ] **Migrations reviewed.** EduMatch uses the *shared* Prisma schema
  (`packages/db`) — a migration you write for EduMatch runs against the
  same database as web/hub/showcase/admin/vionto/timelineai. Read the
  generated SQL (`packages/db/prisma/migrations/<timestamp>_*/migration.sql`)
  before merging, not just the Prisma schema diff. Additive-only changes
  (new nullable column, new table) are low-risk; anything that
  drops/renames a column or table those other apps might reference is
  high-risk and worth a second pair of eyes.
- [ ] **Env vars set.** Cross-reference
  [`docs/edumatch-health-checks.md`](edumatch-health-checks.md)'s
  environment-variables table against `.env.production` — a missing
  `STRIPE_SECRET_KEY`/`OPENAI_API_KEY`/etc. won't fail the deploy (only the
  four vars `vps-deploy.sh` explicitly checks do), it just makes that
  *feature* silently unavailable in production.
- [ ] **Seed data policy understood.** `platform-migrate` (the one-shot
  migration job) does **not** run EduMatch's demo-data seed
  (`db:seed:edumatch`) — that's a separate, manual command
  (`pnpm db:seed:edumatch`, same as local dev) and is meant for
  demo/showcase purposes only. Never run it against production data you
  care about preserving; it's additive but not something to run
  casually on a whim.
- [ ] **CI green.** `pnpm typecheck`, unit tests, and the EduMatch E2E
  suite (`.github/workflows/edumatch-e2e.yml`, #160) all pass on the
  commit being deployed.
- [ ] **Rollback plan is fresh in mind**, not just "I'll figure it out" —
  skim [`docs/edumatch-rollback-runbook.md`](edumatch-rollback-runbook.md)
  before a launch you're not 100% confident in, especially one carrying a
  schema migration.

## Deploy steps

Normal path — nothing manual:

```bash
git push origin main
# .github/workflows/deploy.yml picks it up automatically
```

Manual redeploy (no new commit — e.g. re-running after a transient
failure): trigger `workflow_dispatch` on `deploy.yml` from the GitHub
Actions UI, or run the server-side script directly if you're already SSHed
into the VPS:

```bash
ssh vps
cd /var/repos/asafarim-com
bash infra/scripts/vps-deploy.sh
```

## Post-deploy smoke checks

1. **Watch the deploy output** (GitHub Actions log, or the terminal if run
   manually) for the final `docker compose ps` — every service should show
   `Up` (and, as of #162's healthcheck, `healthy` for `edumatch`
   specifically once it clears its `start_period`).
2. **Hit the health endpoint directly**:
   ```bash
   curl -i https://edumatch.asafarim.com/api/status
   ```
   `200` with `"status":"ok","db":"ok"` means both Caddy routing and the
   app's own DB connectivity are fine. See
   [`docs/edumatch-health-checks.md`](edumatch-health-checks.md) for what
   each field means and how to distinguish "Caddy can't reach the
   container" from "the container itself is unhealthy."
3. **Load the app itself** — `https://edumatch.asafarim.com` in a browser,
   confirm the landing page renders and (if the change touched
   auth/student/tutor surfaces) sign in and check the specific flow that
   changed.
4. **Check for the deploy notification** — Discord (server-side script) and
   Telegram (GitHub Actions workflow) should both have posted. A missing
   notification isn't itself a failure signal (both are best-effort/
   non-fatal on their own failure), but its *absence* combined with any
   other doubt is worth investigating.
5. **Watch logs for a few minutes** past the deploy, not just the instant
   after:
   ```bash
   ssh vps
   cd /var/repos/asafarim-com
   docker compose -f docker-compose.prod.yml --env-file .env.production logs -f --tail=100 edumatch
   ```
   A deploy that "succeeds" (containers up, health check green) can still
   surface errors on first real traffic that a synthetic smoke check
   wouldn't catch — e.g. a route that only fails for a specific locale or
   role.

If any of the above looks wrong, go to
[`docs/edumatch-rollback-runbook.md`](edumatch-rollback-runbook.md).
