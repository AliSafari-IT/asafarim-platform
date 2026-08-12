# Seed data management

Centralised, safety-first management of **deterministic, code-defined seed
data** across the platform, surfaced at **Admin Console → Seed Data**
(`/seed-data`).

> **Scope of this release (PR 1).** The page is **read-only**: status,
> validation and dry-run planning work end to end. Applying a plan
> (seed / reconcile / remove) runs as a background job and is **not yet
> wired up** — see [Roadmap](#roadmap). The provider layer already
> implements the mutations; only the execution path from the UI is absent.

---

## Contents

- [What this manages — and what it does not](#what-this-manages--and-what-it-does-not)
- [Architecture](#architecture)
- [Providers](#providers)
- [Seed semantics](#seed-semantics)
- [Ownership and provenance](#ownership-and-provenance)
- [Permissions](#permissions)
- [Environments and configuration](#environments-and-configuration)
- [Production enablement and risk](#production-enablement-and-risk)
- [Local development](#local-development)
- [Adding a provider](#adding-a-provider)
- [Incident and recovery guidance](#incident-and-recovery-guidance)
- [Roadmap](#roadmap)

---

## What this manages — and what it does not

**It manages** rows that a seed script created and can prove it owns: fixed
primary keys, reserved unique keys, or an explicit provenance column.

**It never touches** user-created data. There is no "delete from table"
path in the codebase: every deletion is driven by an ownership manifest, and
a shared row (such as a demo `User`) is _retained_ — with a stated reason —
the moment it holds anything the seed did not create.

**Backups are explicitly out of scope.** This feature creates no backups,
offers no restore action, and has no restore permission. Any destructive
confirmation in production must therefore state:

> No automatic backup or restore point will be created.

That string is exported as `NO_BACKUP_NOTICE` and asserted by a unit test.

---

## Architecture

```
packages/seed-manager/          server-only, no client-safe exports
  src/
    contracts.ts                the SeedProvider contract and result shapes
    registry.ts                 THE ALLOWLIST — the only id → provider lookup
    environments.ts             env-var table; the only place a DSN is resolved
    safety.ts                   authorization, confirmation phrases, plan checks
    redaction.ts                sanitizeError / redactText / redactValue
    checksums.ts                definition + plan checksums, 5-minute plan TTL
    sql.ts                      read-only pg access for the Drizzle databases
    definitions/                seed data as plain data, shared with the CLI
    providers/                  one file per provider
```

Consumers:

| Consumer                      | Uses                                           |
| ----------------------------- | ---------------------------------------------- |
| `apps/admin` — `/seed-data`   | registry, safety, providers (read-only calls)  |
| `packages/db/prisma/seed*.ts` | the exported `seed*` functions and definitions |

### Three rules the design enforces

1. **No shell.** No HTTP request or server action executes a command, a
   package script, `tsx`, or a CLI. Providers are TypeScript functions
   reached through a frozen allowlist.
2. **No caller-supplied targets.** The browser sends a provider id, an
   environment name and an operation name — each validated against a fixed
   set. Connection strings, hostnames, table names, paths and credentials are
   resolved server-side from allowlisted environment variables and never
   travel in either direction.
3. **No leaks.** Every error is reduced to a `{ code, message }` pair with
   URLs, credentials, libpq keyword pairs and stack traces stripped before it
   reaches the UI, the audit log or the operation history.

### Control plane

Three Prisma models on the shared database record _what happened_, never the
seeded data itself:

| Model                    | Purpose                                                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `SeedOperation`          | one requested operation: target, status, stage, progress, checksums, redacted plan/result summaries, timing, retry and bulk links |
| `SeedOperationEvent`     | append-only sanitized log lines                                                                                                   |
| `SeedValidationSchedule` | recurring **read-only** validation; there is no field that could express a mutating schedule                                      |

Migration: `packages/db/prisma/migrations/20260809200000_add_seed_management`.

The page renders the **last recorded** status rather than inspecting three
databases on every render, and shows a "Status stale" badge after 30 minutes.
Refreshing is an explicit action.

---

## Providers

Every app appears on the page. Apps with no seed data are shown explicitly as
**Not configured** rather than omitted — an absent app is indistinguishable
from an app with nothing to seed.

| Provider                                    | App        | Database           | State                     |
| ------------------------------------------- | ---------- | ------------------ | ------------------------- |
| `platform-foundation`                       | platform   | shared Prisma      | **Configured, protected** |
| `edumatch`                                  | edumatch   | shared Prisma      | Configured                |
| `timelineai`                                | timelineai | shared Prisma      | Configured                |
| `testora`                                   | testora    | Testora Drizzle    | Configured, **read-only** |
| `appbuilder`                                | appbuilder | AppBuilder Drizzle | Configured, **read-only** |
| `admin`, `hub`, `web`, `showcase`, `vionto` | —          | —                  | Not configured            |

### Protected foundation

`platform-foundation` manages permissions, system roles, the
role→permission grid and the optional initial admin. It is **protected**:

- `supports.remove` is `false`;
- `safety.ts` refuses removal _before_ consulting permissions, so no role,
  grant or configuration flag can reach it;
- the provider's own `plan()` and `execute()` throw if a removal somehow
  arrives, so it does not depend on its caller for that guarantee.

Validate, status, seed and reconcile all work normally. The UI labels it
**Protected foundation**.

### Why Testora and AppBuilder are read-only

Both report status and validate connectivity from real provenance, but do not
offer centralised seed/reconcile/remove:

- **Testora's** seed definitions are its code catalog under
  `apps/testora/src/data/**` (~40 files importing `@/test-engine/types`).
- **AppBuilder's** fixture seed runs through `apps/appbuilder/lib/repositories/*`.

Admin must not import from `apps/*`, so making these fully functional
requires extracting those trees into workspace packages. Rather than fake it,
the providers declare `supports.seed/reconcile/remove: false`, `safety.ts`
refuses those operations structurally, and the cards link to each app's own
seeding surface. Their existing CLI commands and in-app buttons are unchanged.

**AppBuilder scope note.** Only the _platform fixtures_ (two seed owners, four
apps) are in scope. Per-generated-app runtime demo-data resets are deliberately
**not** centralised: they are never invoked by "Seed all" or "Remove all
seeded data", and generated-app tenant data is excluded from every bulk plan.

---

## Seed semantics

| Operation        | Writes? | Behaviour                                                                                                                                                                                                         |
| ---------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Validate**     | no      | Definition integrity (duplicate ids, dangling references, invalid relationships), required configuration, and provider connectivity.                                                                              |
| **Status**       | no      | Counts seed-owned rows and compares them with the definitions. Reports clean / missing / drifted / orphaned / not-configured / unavailable / validation-failed.                                                   |
| **Seed missing** | yes     | Inserts missing seed-owned rows only. Never overwrites an existing row, never prunes, never touches user-owned rows. Drifted rows are reported as `retain` with a reason.                                         |
| **Reconcile**    | yes     | Inserts missing rows _and_ updates drifted ones from the definitions. Prunes only where a provider explicitly defines pruning. Preserves documented user-controlled fields. Idempotent — a second run is a no-op. |
| **Remove**       | yes     | Deletes only provably seed-owned rows, in FK-safe order inside a transaction. Retains shared rows that hold non-seed data and reports why.                                                                        |

Reconciliation **never** removes a user-created row merely because the seed
code does not define it.

### Dry runs

Every mutating operation has a first-class dry run that produces a `SeedPlan`:
per-entity insert/update/delete/retain counts, blocked entries, warnings, a
`definitionChecksum`, and a `checksum` over the plan's semantic content.

Before execution the plan is recomputed server-side and compared. Execution is
refused if the plan **expired** (5-minute TTL), if the **target** differs, or
if the **checksum** no longer matches — i.e. if the data moved under the
operator's feet.

Plan checksums deliberately exclude `planId`, `createdAt` and `expiresAt`, so
identical work reproduces an identical checksum, and they include the
environment, so a staging plan can never approve production work.

---

## Ownership and provenance

Each provider declares a manifest. Removal is driven by it and nothing else.

```ts
interface SeedManifestEntry {
  seedKey: string;
  entity: string;
  identity: "id" | "unique-key" | "provenance-column";
  ownership: "seed-owned" | "seed-owned-shared" | "external";
  dependsOn?: string[];
  reconcilable: boolean;
  removable: boolean;
  protectedFields?: string[];
  userControlledFields?: string[];
  notes?: string;
}
```

How each provider proves ownership:

| Provider   | Mechanism                                                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TimelineAI | Timelines pinned to `seed-timeline-<publicId>`; demo author pinned to `seed-timelineai-demo-author`.                                                                  |
| EduMatch   | Exact allowlisted `asafarim+edu…@gmail.com` aliases; scenario graph on fixed `seed-edumatch-*` ids. All members use the bcrypt-hashed `EDUMATCH_SEED_USERS_PASSWORD`. |
| Foundation | Unique permission/role names. Nothing is removable.                                                                                                                   |
| Testora    | Explicit `seeded` boolean on `projects` and `target_environments`.                                                                                                    |
| AppBuilder | Deterministic `owner_principal_id` (`seed-owner-a`/`-b`) and fixed idempotency keys.                                                                                  |

Ownership is **never** inferred from a text search or a creation date.

### Shared rows

`seed-owned-shared` rows (a demo `User`) are removed only when nothing else
references them. A retention check looks for linked sign-in accounts, active
sessions, role assignments and content outside the seeded set; any hit means
the row is retained and the plan says why:

```
retain 1 Demo author — Shared user retained — it owns 1 timeline(s) this seed did not create.
```

If a database ever lacks enough provenance to distinguish seeded from
user-created rows, add an explicit `seedKey` / `seeded` column in an
**additive, backward-compatible** migration _before_ enabling removal.

---

## Permissions

Added to the foundation seed (`definitions/foundation.ts`):

| Permission       | Grants                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| `seeds.view`     | View providers, status, plans, validation results and history. Required to load `/seed-data` at all. |
| `seeds.execute`  | Run seed and reconcile in permitted non-production environments.                                     |
| `seeds.remove`   | Remove seed-owned data. Never applies to the protected foundation.                                   |
| `seeds.schedule` | Create, pause, edit or delete validation schedules.                                                  |

Default grants: **superadmin** gets all four. **admin** gets `seeds.view` and
`seeds.execute` only — `seeds.remove` and `seeds.schedule` are deliberately
opt-in. `standard_user` and `guest` get none.

Superadmin bypasses ordinary permission checks (matching the platform's
existing behaviour) but **never** bypasses the structural rules: protected
providers, unsupported operations, and production enablement.

Beyond ordinary grants, superadmin is _additionally_ required for **any
production mutation** and for **bulk removal**.

Every check runs server-side. The nav entry is hidden without `seeds.view`,
but that is a courtesy — the page itself redirects to `/denied`.

---

## Environments and configuration

Three allowlisted environments: `development`, `staging`, `production`.

Connection strings come only from this table (`environments.ts`):

| Database      | development               | staging                                        | production                                        |
| ------------- | ------------------------- | ---------------------------------------------- | ------------------------------------------------- |
| shared Prisma | `DATABASE_URL`            | `SEED_MANAGER_STAGING_DATABASE_URL`            | `SEED_MANAGER_PRODUCTION_DATABASE_URL`            |
| Testora       | `TESTORA_DATABASE_URL`    | `SEED_MANAGER_STAGING_TESTORA_DATABASE_URL`    | `SEED_MANAGER_PRODUCTION_TESTORA_DATABASE_URL`    |
| AppBuilder    | `APPBUILDER_DATABASE_URL` | `SEED_MANAGER_STAGING_APPBUILDER_DATABASE_URL` | `SEED_MANAGER_PRODUCTION_APPBUILDER_DATABASE_URL` |

Other server-only settings:

| Variable                             | Meaning                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `SEED_MANAGER_PRODUCTION_ENABLED`    | Must be exactly `true` to allow any production mutation. Absent or any other value = disabled.          |
| `SEED_MANAGER_TIMEOUT_MS`            | Default per-provider timeout (default 120 000, clamped to 5 000–900 000).                               |
| `SEED_MANAGER_TIMEOUT_MS_<PROVIDER>` | Per-provider override, e.g. `SEED_MANAGER_TIMEOUT_MS_TIMELINEAI`.                                       |
| `SEED_MANAGER_TEST_DATABASE_URL`     | **Tests only.** The integration suite refuses to run without it and never falls back to `DATABASE_URL`. |

A missing variable surfaces as _"`SEED_MANAGER_STAGING_DATABASE_URL` is not
set on the server"_ — the **name**, never the value. Resolved connection
strings never appear in the UI, logs, errors, audit data or API responses.

---

## Production enablement and risk

Production is **disabled by default**. Enabling it requires setting
`SEED_MANAGER_PRODUCTION_ENABLED=true` in `.env.production` (via the
`envage`/`age` workflow — see `docs/environment-management.md`; editing the
decrypted file directly is futile, it is regenerated on the next decrypt).

With it enabled, a production mutation still requires **all** of:

- the `superadmin` role;
- the relevant seed permission;
- a session issued within the last **15 minutes**;
- a typed, target-specific confirmation phrase — e.g. `REMOVE EDUMATCH PRODUCTION`
  (bulk removal uses `REMOVE ALL SEEDED DATA FROM STAGING`-style phrasing);
- an additional acknowledgement for remove/reconcile;
- a plan recomputed immediately before execution whose checksum still matches;
- affected record counts displayed before confirmation.

Plus: an unmistakable production warning, rate limiting, double-submit
protection, a full audit event and operation-history record, and no
cancellation once the first mutation transaction has begun.

**Risk statement.** Because backups are out of scope, a production removal is
irreversible by this feature. Recovery depends entirely on your infrastructure
snapshots, which this feature neither creates nor knows about.

---

## Local development

```bash
pnpm db:up                                   # Postgres + Redis
pnpm --filter @asafarim/db db:migrate:deploy # includes the seed-management tables
pnpm --filter @asafarim/db db:seed           # foundation + the seeds.* permissions
pnpm --filter @asafarim/admin dev            # http://localhost:3003/seed-data
```

You need the `admin` (or `superadmin`) role **and** `seeds.view`. Re-running
`db:seed` grants `seeds.view`/`seeds.execute` to the `admin` role.

### CLI seeds are unchanged

The commands and their behaviour are exactly as before — they are now thin
wrappers over the shared functions, so the console and the command line
cannot drift:

```bash
pnpm --filter @asafarim/db db:seed
pnpm --filter @asafarim/db db:seed:edumatch
pnpm --filter @asafarim/db db:seed:timelineai
pnpm --filter @asafarim/db db:deploy:migrate-and-seed   # uses --only-if-empty
```

`--only-if-empty` still skips entirely when any timeline exists, protecting
production content from being overwritten on deploy.

### Tests

```bash
pnpm --filter @asafarim/seed-manager test        # 65 unit tests
pnpm --filter @asafarim/seed-manager typecheck
```

Integration tests are **skipped** unless you point them at a disposable
database. They never fall back to `DATABASE_URL`:

```bash
createdb seed_manager_test
cd packages/db && DATABASE_URL=<test-url> npx prisma migrate deploy
SEED_MANAGER_TEST_DATABASE_URL=<test-url> pnpm --filter @asafarim/seed-manager test
```

---

## Adding a provider

1. **Definitions** — add `src/definitions/<app>.ts` exporting plain data plus
   a `<APP>_DEFINITION_VERSION`. Keep it free of database access so the CLI,
   the provider and the tests share one source of truth.

2. **Provenance** — decide how a row is provably yours: a pinned id, a
   reserved unique key, or a `seeded`/`seedKey` column. If none exists, add
   one in an additive migration **before** implementing removal.

3. **Manifest** — one `SeedManifestEntry` per entity: `seedKey`, `identity`,
   `ownership`, `dependsOn` (parents first), `reconcilable`, `removable`,
   `protectedFields`, `userControlledFields`.

4. **Implement the contract** in `src/providers/<app>.ts`:
   - `validate` — definition integrity plus a connectivity probe. No writes.
   - `inspect` — present / missing / drifted / orphaned per entity. No writes.
   - `plan` — build `SeedPlanChange[]` and pass it to `buildPlan()`, which
     computes the checksum and TTL. **Must not write.**
   - `execute` — apply the approved plan, then re-inspect and return
     `verifiedStatus` so the UI never has to guess.

   Wrap failures in `sanitizeError()`. Return `unavailableStatus()` rather
   than throwing when the database is unreachable — one provider being down
   must not break the page.

5. **Register** it in `src/registry.ts`. Set `supports` honestly: if you
   cannot implement an operation safely yet, set it to `false` and let
   `safety.ts` refuse it. Never fake success.

6. **Environment** — if it needs a new database, add a row to
   `CONNECTION_ENV_VARS` in `environments.ts` and document the variables here.

7. **Tests** — the shared suites in `registry.test.ts` and `definitions.test.ts`
   pick up new providers automatically (unique ids, manifest integrity,
   dependency resolution, protected-provider rules). Add provider-specific
   validation and, ideally, guarded integration tests.

8. **CLI** — if there is a command-line entry point, make it a thin wrapper
   over your exported seed function. Do not duplicate the mutation logic.

---

## Incident and recovery guidance

**There are no backups and no restore action in this feature.** Plan
accordingly.

| Symptom                                      | What it means                                          | What to do                                                                                |
| -------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Provider shows **Database unavailable**      | Connection failed; the sanitized reason is on the card | Check the service; other providers keep working. Retry with _Refresh status_.             |
| Provider shows a **missing env var** by name | Server configuration, not data                         | Set the named variable and redeploy. Never paste a DSN into the UI — there is nowhere to. |
| **Drift detected**                           | Database rows differ from the definitions              | Dry-run _reconcile_ and read the plan before applying.                                    |
| **Orphaned rows**                            | Seed-owned rows the code no longer defines             | Dry-run _remove_; orphans are listed separately and warned about.                         |
| Plan refuses with **CHECKSUM_MISMATCH**      | Data changed since the dry run                         | Working as intended. Re-run the dry run and re-read it.                                   |
| Plan refuses with **EXPIRED**                | Older than 5 minutes                                   | Re-run the dry run.                                                                       |
| Accidental removal in production             | Irreversible by this feature                           | Restore from infrastructure snapshots. This feature cannot help.                          |

Failures are visible through the Seed Data overview, the operation history and
the platform audit log. There are intentionally no Slack or email
notifications in this version.

### Audit events

`seed.validation.requested`, `seed.status.requested`, `seed.plan.created`,
`seed.execution.requested`, `seed.completed`, `seed.failed`, `seed.cancelled`,
`seed.schedule.created`, `seed.schedule.updated`, `seed.schedule.deleted`.

Each records actor, provider, environment, operation, plan checksum, counts,
result status and bulk group id, redacted via `redactSensitive()`. A failed
audit write is non-fatal (existing Admin convention) but the `SeedOperation`
row still captures the result.

---

## Roadmap

**PR 1 (this change)** — provider contract, registry, five providers,
control-plane models, `seeds.*` permissions, refactored CLI wrappers, the
`/seed-data` page with status + validation + dry runs + history, 74 tests.

**PR 2 — execution.** BullMQ queue and `admin-worker`, the mutating server
actions with typed confirmation and plan revalidation, progress via SSE with
polling fallback, cancellation, retry, bulk operations with per-provider
results, scheduled validation, and worker deployment wiring.

**PR 3 — Testora and AppBuilder.** Extract `apps/testora/src/data/**` and
AppBuilder's repository layer into workspace packages, then promote both
providers from read-only to fully functional.
