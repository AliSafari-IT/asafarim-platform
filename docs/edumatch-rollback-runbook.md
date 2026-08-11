# EduMatch: rollback runbook

Tracks #163 (part of #89, "Launch readiness"). How to revert a bad EduMatch
deploy — both the application container and, the higher-risk case, a
database migration. Companion to
[`docs/edumatch-launch-runbook.md`](edumatch-launch-runbook.md).

**The database migration procedure below was dry-run against a disposable
local Postgres container as part of writing this doc — not just described.**
See "Dry run: what was actually tested" at the bottom for the exact
commands and output.

## The shared-database risk, up front

EduMatch does **not** have its own database. It shares the platform Prisma
schema (`packages/db`) with web, hub, showcase, admin, vionto, and
timelineai. This has one consequence that shapes everything below:

> **A migration you write "for EduMatch" is a migration against every one
> of those apps' database too.** There is no way to roll back EduMatch's
> schema changes in isolation — rolling back means rolling back (or
> forward-fixing) the shared schema, full stop. If you're ever tempted to
> "just quickly revert this one EduMatch migration," check first whether
> any other app's Prisma models reference the table/column you're touching.

There is also, as of this writing, **no automated pre-deploy database
backup**. `platform-migrate` runs directly against production data with no
snapshot taken first. This is a real gap, not a deliberate design choice —
noted here rather than papered over, since a runbook that hides a gap is
worse than one that names it. Until an automated backup exists, take a
manual one before any migration you're not fully confident in:

```bash
ssh vps
docker exec <postgres-container-name> pg_dump -U asafarim -Fc asafarim > /var/backups/asafarim-$(date -Is).dump
```

## Two kinds of "bad deploy," two different fixes

### 1. Bad application code, migration was fine (or there was no migration)

This is the common case and the cheap fix — checkout the previous good
commit and redeploy. Remember: there's no image tag to swap, `main` gets
rebuilt from source every time, so "rollback" here literally means
"deploy an older commit."

```bash
ssh vps
cd /var/repos/asafarim-com
git log --oneline -10                    # find the last good commit
git reset --hard <last-good-commit-sha>
bash infra/scripts/vps-deploy.sh
```

Then push a revert commit to `main` on GitHub too (not just on the VPS) —
otherwise the next ordinary push-to-main deploy re-introduces the bad
commit, since `vps-deploy.sh` always does `git reset --hard origin/main`.

### 2. A migration shipped as part of the bad deploy

This is the risky case, and it splits into two sub-cases depending on
**whether the migration succeeded or failed partway**:

#### 2a. The migration succeeded, but was itself wrong

`vps-deploy.sh` runs `platform-migrate` to completion before touching app
containers — if it succeeded, the shared schema now has the bad change
applied, live, potentially with other apps' containers already restarted
against it.

**Prisma has no "undo" for an applied migration.** The only safe production
pattern is a **new forward migration that reverts the bad change** —
*never* edit or delete a migration file that has already run against
production; Prisma tracks applied migrations by content hash, and editing
history desyncs every other environment (and every other developer's local
DB) from what production actually ran.

```bash
cd packages/db
npx prisma migrate dev --create-only --name revert_<original-migration-name>
# Hand-edit the generated migration.sql to undo the bad change (e.g. the
# original added a column -> this one drops it; the original dropped a
# column -> restoring it needs the DATA back too, not just the schema —
# see the backup step above if that's the situation you're in).
git add prisma/migrations/
git commit -m "fix(db): revert <original-migration-name>"
git push origin main
# Deploy normally — vps-deploy.sh's platform-migrate step applies it.
```

#### 2b. The migration failed partway through

`platform-migrate` failing is actually the **safe** outcome —
`vps-deploy.sh` aborts before touching any app container, so the previous
release keeps running untouched. But Prisma now considers that migration
**failed** in `_prisma_migrations`, and refuses to apply anything else
(including a fix) until you tell it what actually happened to the database:

```bash
# See exactly which migration is stuck:
DATABASE_URL=<prod-url> npx prisma migrate status

# Check whether the failing migration's DDL partially applied — Postgres
# wraps a single migration.sql in one transaction, so a syntax/type error
# (like the dry run below) leaves NO partial change; a runtime error after
# some earlier statements in a multi-statement migration.sql could leave a
# partial change (rare, but check).

# If nothing partially applied (the common case):
DATABASE_URL=<prod-url> npx prisma migrate resolve --rolled-back "<failed-migration-name>"

# If something DID partially apply and you manually fixed the DB to match
# what the migration intended:
DATABASE_URL=<prod-url> npx prisma migrate resolve --applied "<failed-migration-name>"
```

Either way, fix the actual bug in a **new** migration (never re-edit the
failed one — same content-hash reasoning as 2a) and redeploy.

## Monitoring after a rollback

Same signals as a normal deploy — see the launch runbook's post-deploy
smoke checks — with extra attention to:

```bash
# Confirm the shared schema is actually consistent after any migrate
# resolve command:
DATABASE_URL=<prod-url> npx prisma migrate status
# Should read "Database schema is up to date!"

# Watch every app that shares the schema, not just EduMatch, for a few
# minutes — a schema rollback that only breaks a table EduMatch doesn't
# read from could still break web/hub/admin/vionto/timelineai silently:
docker compose -f docker-compose.prod.yml --env-file .env.production ps
```

## Dry run: what was actually tested

Run against a disposable local Postgres (`docker run postgres:16`, a fresh
container/volume, torn down afterward — never the shared dev database),
covering both failure sub-cases above.

**Baseline**: applied all 16 real migrations from `packages/db/prisma/migrations`
via `prisma migrate deploy` — succeeded cleanly, matching a fresh
production-equivalent state.

**Case 2a (bad-but-successful migration)**:
1. Authored a throwaway migration adding `EduBooking.dryRunBadColumn` — applied via `prisma migrate deploy`. Succeeded (simulating a bad deploy that shipped).
2. Confirmed the column existed (`psql \d "EduBooking"`).
3. Authored the corrective migration (a plain `DROP COLUMN`) and applied it via `prisma migrate deploy` — succeeded.
4. Confirmed the column was gone. **Matches the documented 2a procedure exactly.**

**Case 2b (migration fails partway)**:
1. Authored a migration with deliberately invalid SQL (`NOT_A_REAL_TYPE`) — `prisma migrate deploy` failed with `P3018`, exactly the error `vps-deploy.sh` is written to catch and abort on.
2. `prisma migrate status` confirmed the migration was marked `failed` and blocking further migrations — matching the documented symptom.
3. Confirmed via `psql \d "EduBooking"` that **no partial schema change** occurred (Postgres wrapped the single-statement `migration.sql` in one transaction; the type error rolled it back entirely) — confirming `--rolled-back` was the correct resolve command for this case, not `--applied`.
4. Ran `prisma migrate resolve --rolled-back "<name>"` — succeeded.
5. `prisma migrate status` afterward read "Database schema is up to date!" — confirming the database was back to a normal, deployable state.

Both throwaway migration directories were deleted (never committed) and the
scratch Postgres container removed after the dry run.
