# M12 Backup and Restore Runbook

## Scope

AppBuilder owns exactly one Postgres database (`APPBUILDER_DATABASE_URL`)
and one object-storage bucket (via `@asafarim/storage`). This runbook
covers both. It does not cover the platform's shared Prisma database
(Hub/Admin/etc.) — that is a separate system with its own backup posture.

## Cadence, retention, encryption, storage location

- **Cadence**: on-demand via `pnpm --filter appbuilder backup:run`
  (`--scheduled` flag when invoked from a cron/CI job, for audit-trail
  clarity — `backup_runs.trigger` records which). Recommended production
  cadence: **daily**, matching the RPO in the observability runbook. No
  in-repo scheduler exists — wire this into whatever cron/CI system already
  runs other operational jobs for this platform.
- **Retention**: 30 days by default (`RETENTION_DAYS` in
  `lib/backup/runBackup.ts`), recorded per-run as `backup_runs.retention_expires_at`.
  Actual deletion of expired backup artifacts from object storage is not
  yet automated in M12 (tracked as follow-up) — the metadata makes it
  straightforward to add a sweep identical in shape to
  `lib/retention/sweep.ts`.
- **Encryption**: at-rest, provider-managed (the default for the
  S3-compatible backend `@asafarim/storage` targets in production; local
  dev falls back to a plain local directory with no encryption, which is
  fine for dev and never used for a real backup). Recorded per-run as
  `backup_runs.encryption` (currently always `"at-rest (provider-managed)"`
  — if a stronger scheme, e.g. client-side envelope encryption before
  upload, is ever adopted, update both the script and this string).
- **Storage location**: `backups/database/appbuilder-<timestamp>.dump`
  in the same bucket AppBuilder already uses for generated-app files —
  recorded per-run as `backup_runs.location`. A dedicated bucket/prefix
  with stricter access policy is a reasonable production hardening step,
  not yet done in M12.

## Running a backup

```bash
pnpm --filter appbuilder backup:run
```

This runs `pg_dump --format=custom` against `APPBUILDER_DATABASE_URL`,
uploads the artifact, computes a sha256 checksum, and records a
`backup_runs` row (`status: "succeeded"`, `sizeBytes`, `checksum`). A
failure records `status: "failed"` with a truncated error message — it
never leaves a row silently stuck at `"running"` past the point pg_dump
actually exits.

**Real evidence** (recorded during this milestone's implementation,
`backups/database/appbuilder-2026-07-27T21-13-55-209Z.dump`, 346,653 bytes,
sha256 `a1b0fc5db1da8804...`) is visible in the readiness dashboard's
"Backup & restore" card and via:

```sql
SELECT id, kind, status, size_bytes, checksum, completed_at FROM backup_runs ORDER BY started_at DESC;
```

## Running a restore rehearsal

```bash
# Optional — defaults to a sibling "<dbname>_restore_rehearsal" database on the same server.
export APPBUILDER_RESTORE_REHEARSAL_DATABASE_URL="postgres://appbuilder:appbuilder_dev@127.0.0.1:55436/appbuilder_restore_rehearsal"
pnpm --filter appbuilder backup:restore-rehearsal
```

This takes the most recent succeeded backup, restores it into the
rehearsal target via `pg_restore`, and verifies row counts across eleven
tables spanning app metadata, specifications, collaborators, releases,
domains, deployments, generated data, validation runs, and audit records.

**Safety** (`lib/backup/safety.ts#assertNotProduction`, unit-tested in
`lib/backup/safety.test.ts`): refuses to run unless the target is provably
distinct from the source by three independent checks — different
connection string, different database name, AND a database name that
contains `"rehearsal"`, `"restore"`, or `"test"`. Any one of these failing
aborts the script before it touches anything. This script **never** runs
against production and **never** performs a destructive operation against
`APPBUILDER_DATABASE_URL`.

**Real evidence** (recorded during this milestone's implementation, after
the e2e fixture suite had populated the dev database): a real rehearsal
against this repository's dev database succeeded, restoring into
`appbuilder_restore_rehearsal` and verifying:

```json
{
  "apps": 83, "specifications": 83, "specification_versions": 332,
  "collaborators": 74, "releases": 8, "app_domains": 8, "deployments": 8,
  "generated_records": 160, "generated_files": 0, "validation_runs": 12,
  "audit_events": 558
}
```

Every non-empty table round-tripped with its exact source row count;
`generated_files` restored empty because the source genuinely had none at
rehearsal time (the script reports this explicitly — "1 table(s) restored
empty or missing" — rather than silently treating it as success or
failure).

## Recovery objectives

- **RPO** (max acceptable data loss): ≤24 hours, matching a daily backup
  cadence.
- **RTO** (max acceptable time to restore): target ≤2 hours; the rehearsal
  script itself completed in well under a minute against the current small
  dev dataset — production RTO scales with database size and has not been
  measured at production scale.

## Full recovery procedure (production incident)

1. **Stop writes** — take the AppBuilder app and worker offline (or put
   them in maintenance mode) so nothing writes to the database mid-restore.
2. **Identify the target backup** — `SELECT * FROM backup_runs WHERE kind = 'database' AND status = 'succeeded' ORDER BY started_at DESC LIMIT 5;` against whatever database is still reachable, or from object-storage listing directly if the database itself is the thing that's lost.
3. **Provision a fresh database** (or repair the existing instance).
4. **Restore**: `pg_restore --no-owner --no-acl --dbname <new-connection-string> <downloaded-dump-file>` (the same command `runRestoreRehearsal.ts` runs programmatically — for a real incident, download the artifact manually if the automation itself isn't available).
5. **Verify**: run the same row-count spot-check the rehearsal script performs (`VERIFICATION_TABLES` in `lib/backup/runRestoreRehearsal.ts`) against the restored database, plus a manual sanity check of a few known apps if any are remembered.
6. **Repoint** `APPBUILDER_DATABASE_URL` at the restored database and bring the app/worker back online.
7. **Record the incident** — a manual `backup_runs`-adjacent note or an entry in whatever incident tracker the team uses; this runbook does not yet auto-record production incidents.

## What a restore recovers (and what it doesn't)

Recovers (verified by the rehearsal's own row-count check): app metadata,
specifications and their full version history, collaborators, releases and
their frozen manifests, app-domain/routing state, deployment history,
generated application data (records/files/relations), validation runs, and
the audit trail.

Does **not** independently recover: object-storage bytes for generated
files or backup artifacts themselves (those live in the bucket, not the
database — `generated_files.storage_key`/`backup_runs.location` are
pointers into it; a full disaster-recovery drill must also verify the
bucket's own durability, which is the storage provider's responsibility,
not this script's). Also does not recover anything from the platform's
separate shared Prisma database (user identities, sessions) — see "Scope"
above.
