# AppBuilder

Metadata-driven AI application factory (`appbuilder.asafarim.com`). Users
describe an internal business application, receive a controlled/versioned
application specification, preview it at `/apps/{appId}/preview`, refine it
conversationally, validate it, and publish an immutable release.

This is **M06** of the delivery series tracked in
[issue #29](https://github.com/AliSafari-IT/asafarim-platform/issues/29): the
approved template/component registry and metadata-driven preview runtime,
on top of M02's persistence layer, M03's SSO/authorization, M04's versioned
specification contract, and M05's catalog/creation flow. See
[docs/adr/0001-appbuilder-managed-runtime.md](../../docs/adr/0001-appbuilder-managed-runtime.md)
for the architectural decision this scaffold builds on,
[docs/appbuilder-architecture.md](../../docs/appbuilder-architecture.md) for
the route contracts, milestone map, and the capability matrix,
[packages/appbuilder-schema/README.md](../../packages/appbuilder-schema/README.md)
for the M04 specification/operation contract, and
[docs/appbuilder-runtime.md](../../docs/appbuilder-runtime.md) for the full
M06 registry/renderer architecture, security model, and preview lifecycle.

## What's here (M01–M06)

- Next.js 16 App Router shell using `@asafarim/ui` directly (no forked
  components).
- Route contracts: `/`, `/apps`, `/apps/new`, `/apps/[appId]`,
  `/apps/[appId]/preview` — each a defined page, not a 404, with the real
  behavior arriving in later milestones (noted inline on each page).
- `GET /api/health` — liveness plus a database readiness check.
- `loading.tsx` / `error.tsx` / `not-found.tsx` using the shared
  `EmptyState` / `Alert` primitives.
- AppBuilder's own PostgreSQL database (`APPBUILDER_DATABASE_URL`), isolated
  from the platform's shared Prisma database and from every other app's
  database — never reused for AppBuilder product data.
- Drizzle ORM + migrations for the M02 foundation: generated apps,
  collaborators, specifications, immutable specification versions, applied
  operations, preview builds, releases, deployments, audit events, and an
  idempotency-key ledger.
- A repository layer (`lib/repositories/`) that requires an authenticated
  actor and always scopes reads/writes by `appId` — there is no unscoped
  "get by id" or "get all" helper for tenant-owned data.
- Full platform SSO: AppBuilder shares the `@asafarim/auth` Auth.js session
  and the `.asafarim.com` cookie with every other app. `proxy.ts` protects
  every route except `/` and `/api/health`; HTML requests redirect through
  Hub's centralized `/sign-in` with a safe, absolute callback back to
  AppBuilder, API requests get a 401/403 JSON body.
- A single, capability-based authorization policy
  (`lib/repositories/authz.ts#assertCapability`) covering owner/editor/viewer
  access to every generated app — see the capability matrix below.
- Registered in the platform app registry (`@asafarim/auth`'s
  `PLATFORM_APPS`) and `getPlatformLinks()`; Hub's launcher and app switcher
  pick it up automatically for any signed-in active user, no AppBuilder-
  specific code in Hub.
- A versioned, validated `ApplicationSpecification` contract and a pure,
  deterministic controlled-operation engine
  (`@asafarim/appbuilder-schema`) — the single source of truth the future
  AI planner (M07) and metadata-driven runtime (M06) will share. See
  "Specification engine" below.
- `applyOperation` now runs every change through that engine with real
  optimistic concurrency (row-locked, proven under concurrent Postgres
  transactions), payload-checked idempotency, and destructive-change
  confirmation — every successful change is one new immutable
  `specification_versions` row, atomically with its `applied_operations`
  record and audit event.
- Version history, structured compare (diff), restore-as-a-new-version, and
  safe undo-by-inverse-operation (`lib/repositories/versions.ts`,
  `lib/repositories/specifications.ts`).
- A production-quality, actor-scoped `/apps` catalog: search, status
  (active/archived/all) and access (owned/shared/all) filters, sort
  (recently updated/created/name), deterministic server-side pagination, and
  responsive cards — all driven by validated URL search params (see
  [docs/appbuilder-architecture.md](../../docs/appbuilder-architecture.md#catalog-creation-and-lifecycle-m05)).
- A prompt-first `/apps/new` creation form (name, business description/
  prompt, starter family, visibility) backed by a shared Zod validation
  schema and a single atomic creation transaction — app + specification +
  initial draft version + creation-intent record + audit event — protected
  by M02's idempotency ledger against double-click/refresh/retry.
- A truthful `/apps/[appId]` continuation/overview page (status, role,
  draft version, starter family, preview/release summaries, a "Build/Rebuild
  preview" action, and a safe diagnostic when the latest preview attempt
  failed) and explicit archive/restore confirmation pages, both
  owner-authorized and idempotent.
- **M06**: `@asafarim/appbuilder-runtime` — an approved registry of ~13
  rendering primitives plus shell/navigation/page-header chrome, and a
  deterministic `renderPreview()` renderer with zero database/auth/AI/
  Next.js dependency. `/apps/[appId]/preview/[[...path]]` renders the app's
  pinned, successful preview build for real — homepage, internal page
  navigation, refresh/deep-link version pinning, generated-app 404 for an
  unknown path, and a sanitized diagnostic for any other render failure.
  `lib/repositories/previewService.ts` creates/reuses idempotent preview
  builds pinned to `(specificationVersionId, checksum, registryVersion)`
  and only ever advances the pinned pointer on success. A strict,
  per-request-nonce CSP (`proxy.ts`) protects the preview route. Full
  details: [docs/appbuilder-runtime.md](../../docs/appbuilder-runtime.md).
- A five-template registry (`blank`, `task_management`, `crm`, `inventory`,
  `booking`) in `@asafarim/appbuilder-runtime`, matching M05's
  `StarterFamily` enum — not yet wired into app creation (see "What's
  explicitly not here yet").
- A permanent Playwright browser-automation harness
  (`apps/appbuilder/tests/e2e/`, `pnpm e2e`) — M05 shipped without one; this
  milestone adds it and backfills the core M05 create → catalog →
  continuation → archive → restore flow alongside the new preview-specific
  coverage (capability matrix, security, accessibility, responsive).

## What's explicitly not here yet

- Natural-language interpretation of the creation prompt and OpenAI/AI
  provider calls (M07) — M05 only records the user's prompt and
  starter-family choice; M06's template registry exists but isn't yet
  applied to a new app's initial specification (an explicit, scoped
  deferral — see [docs/appbuilder-runtime.md](../../docs/appbuilder-runtime.md)).
- The rich builder workspace, conversational editing, and component
  selection (M08) — `/apps/[appId]` is a truthful overview, not the editor.
- Functional generated-record CRUD and any real generated-app data (M09) —
  every data-dependent M06 registry entry renders deterministic, clearly
  labelled preview/demo data or a safe empty state, never a persisted
  record.
- Production routing / deployment of AppBuilder itself, and any per-generated-app
  deployment (M11).
- Generated-app end-user authentication, email invitations, enterprise
  organizations/SCIM/billing, and the finalized generated-data RBAC (M09) —
  all explicitly out of scope through M05.
- Executing a destructive change against real generated-app *data* — there
  is none at this layer; M04 only classifies and gates destructive changes
  to the *specification*.
- Hard deletion of an app — M05 only archives/restores; permanent deletion
  is out of scope for the whole MVP delivery series.

## Authentication and authorization (M03)

AppBuilder has no local sign-in page or user table of its own — it
authenticates entirely through the shared platform session.

- **Session**: `@asafarim/auth`'s Auth.js config (JWT strategy, shared
  `.asafarim.com` cookie in production, `localhost` cookie domain in dev so
  the session is readable across every app's port). AppBuilder mounts the
  same `handlers` at `app/api/auth/[...nextauth]/route.ts` as every other
  app (Hub, Admin, Vionto) — this is not a second auth system, just the one
  shared NextAuth instance running in another process.
- **Route protection**: `proxy.ts` (`createAuthProxy` from
  `@asafarim/auth/proxy`) treats every route as protected except `/` and
  `/api/health`. A signed-out HTML request is redirected to
  `${HUB_URL}/sign-in?callbackUrl=<absolute-appbuilder-url>` — the same
  redirect convention Vionto and Admin use. A signed-out API request gets
  `401 {"error":"Unauthorized"}` JSON, never an HTML page. A deactivated
  session gets `403 {"error":"Account deactivated"}`.
- **Trusted callback origin**: `packages/auth/src/config.ts`'s
  `getTrustedOrigins()` includes `NEXT_PUBLIC_APPBUILDER_URL`, so Auth.js's
  `redirect` callback accepts AppBuilder as a valid cross-origin callback
  target — any other origin falls back to the base sign-in URL.
- **Platform app registry**: AppBuilder is registered in `PLATFORM_APPS`
  with `access: "authenticated"` — any signed-in, active user may open the
  app itself. Per-generated-app ownership is a separate, second gate
  enforced entirely inside AppBuilder (see below); the platform-level gate
  never grants access to another user's data.
- **Actor identity**: `lib/auth/session.ts#getActor()` maps the session to
  `{ principalId, roles }`, returning `null` for a missing, invalid,
  expired, or deactivated session. This is the *only* source of actor
  identity — repository methods and API routes never read an actor or
  owner id from a request body/query/params.

### Capability matrix

`lib/repositories/authz.ts` defines named capabilities instead of scattered
role comparisons, so later milestones (M04 operations, M06 previews — now
live, M09 release RBAC) extend one contract rather than inventing their own
checks.

| Capability | Viewer | Editor | Owner |
| --- | --- | --- | --- |
| `app.view` (list/view) | ✅ | ✅ | ✅ |
| `app.viewPreview` | ✅ | ✅ | ✅ |
| `app.editSpecification` | ❌ | ✅ | ✅ |
| `app.applyOperation` | ❌ | ✅ | ✅ |
| `app.manageCollaborators` | ❌ | ❌ | ✅ |
| `app.archive` / `app.restore` | ❌ | ❌ | ✅ |
| `app.validate` (M10) | ❌ | ✅ | ✅ |
| `app.approve` (M10) | ❌ | ❌ | ✅ |
| `app.deployRelease` (M11) | ❌ | ❌ | ✅ |

- The **platform superadmin** bypass (`assertCapability` treats a session
  with the `superadmin` role as an implicit owner on any app) mirrors the
  existing, documented platform policy in `packages/auth`
  (`hasRole`/`getAppAccessDecision`: superadmin always passes) — it is not
  a bypass invented for AppBuilder, and it is **not** applied to
  `listAppsForActor` (a superadmin doesn't get every tenant's apps dumped
  through the list endpoint, only capability-gated access to a *named*
  app).
- **Leak prevention**: an actor with *no* relationship to an app (not the
  owner, not an active collaborator, not superadmin) gets `NotFoundError`
  for every operation — identical to the app simply not existing. An actor
  who *is* related but lacks the capability's minimum role gets
  `ForbiddenError` instead — they already know the app exists.
- **Final-owner protection**: `collaborators.ts` refuses to add, revoke, or
  re-role a collaborator whose `principalId` equals the app's
  `ownerPrincipalId` (`ConflictError`). Ownership transfer isn't
  implemented in M03.
- **Idempotency + transactions**: unchanged from M02 — collaborator
  add/revoke/role-change and the audit event they produce run in one
  `db.transaction`.

### Audit

Every protected mutation (`app.created`, `app.archived`, `app.restored`,
`collaborator.added`, `collaborator.role_changed`, `collaborator.removed`,
`operation.applied`, ...) writes an `audit_events` row with
`actorPrincipalId` set from the trusted `Actor`, never from a client-
supplied field. Audit `metadata` carries only non-sensitive identifiers
(principal ids, roles, operation types) — never session tokens, cookies, or
secrets.

## Specification engine (M04)

The pure contract/engine lives in
[`@asafarim/appbuilder-schema`](../../packages/appbuilder-schema) — no
Next.js/database/auth/AI dependency, safe for the runtime (M06), the AI
orchestrator (M07), and plain tests/scripts to import. This app only
integrates it with persistence and authorization:

- **`lib/repositories/operations.ts#applyOperation`** — takes
  `{ operation, baseVersionNumber, idempotencyKey, confirmDestructive? }`.
  Requires `app.applyOperation`. Loads the current draft's payload (or the
  implicit empty specification for a brand-new app), runs
  `applySpecOperation` from the schema package, and — only on success —
  inserts one new `specification_versions` row (with `parentVersionId`,
  `schemaVersion`, `engineVersion`, `summary`, `checksum`), advances
  `specifications.currentVersionNumber`, inserts the `applied_operations`
  row, and records an audit event, all in one transaction.
- **Optimistic concurrency**: the specification row is locked
  (`SELECT ... FOR UPDATE`) before comparing `baseVersionNumber` to the
  actual current version — proven under real concurrent Postgres
  transactions (two simultaneous requests against the same base: exactly
  one succeeds, the other gets `StaleVersionError` with both version
  numbers, and neither user's intended change is lost or silently merged).
- **Idempotency**: `applied_operations.request_hash` (sha256 of the
  operation + base) lets a retried request with the same
  `idempotencyKey` replay its original result; the same key with a
  different payload is `ConflictError`.
- **Destructive changes**: a change the engine classifies as destructive
  (see the schema package's `classifyDestructiveChange`) is rejected with
  `DestructiveConfirmationRequiredError` (carrying the classification and
  human-readable impact) unless the caller passes `confirmDestructive: true`.
- **Any failure — validation, staleness, idempotency conflict, or
  unconfirmed destructive change — leaves the database exactly as it was**:
  no partial version, no partial operation row (proven directly against
  real Postgres in `lib/repositories/specificationEngine.integration.test.ts`).
- **`lib/repositories/versions.ts`** — `restoreVersion` (copies an older
  version's payload forward as a new version; never rewrites history) and
  `undoLastOperation` (computes and applies the safe inverse of the
  operation that produced the current version via the schema package's
  `invertOperation`, or throws `RestoreRequiredError` when no safe inverse
  exists — the caller should offer `restoreVersion` instead of guessing).
  Both go through the same optimistic-concurrency + idempotency contract as
  `applyOperation`.
- **`lib/repositories/specifications.ts`** — `listVersionsForActor`,
  `getVersionForActor`, and `compareVersionsForActor` (structured diff via
  the schema package's `diffSpecifications`) — all read-only, requiring
  `app.view`.

## Development

```bash
pnpm --filter @asafarim/appbuilder dev      # http://localhost:3006
pnpm --filter @asafarim/appbuilder build
pnpm --filter @asafarim/appbuilder typecheck
pnpm --filter @asafarim/appbuilder lint
pnpm --filter @asafarim/appbuilder test              # unit only, no database needed
pnpm --filter @asafarim/appbuilder test:integration  # requires appbuilder-postgres running
pnpm --filter @asafarim/appbuilder e2e                # Playwright — starts hub+appbuilder dev servers,
                                                       # seeds real users/apps, needs appbuilder-postgres
                                                       # and the platform Postgres (DATABASE_URL) running
pnpm --filter @asafarim/appbuilder e2e:report         # open the last Playwright HTML report
```

Or run everything (including this app) via the monorepo root `pnpm dev`.

## Database

AppBuilder's database is defined by [`lib/db/schema.ts`](lib/db/schema.ts)
and migrated with Drizzle Kit.

```bash
# Start just this app's database (part of the shared root docker-compose.yml)
docker compose up -d appbuilder-postgres

# Apply pending migrations (idempotent — safe to rerun)
pnpm --filter @asafarim/appbuilder db:migrate

# Generate a new migration after editing lib/db/schema.ts
pnpm --filter @asafarim/appbuilder db:generate

# Seed local fixtures: two owners, two apps each
pnpm --filter @asafarim/appbuilder db:seed

# Inspect data
pnpm --filter @asafarim/appbuilder db:studio
```

Connection string: `APPBUILDER_DATABASE_URL`, defaulting to
`postgres://appbuilder:appbuilder_dev@localhost:55436/appbuilder` in local
dev (see [`.env.local.example`](.env.local.example)). **Never** point
AppBuilder product code at the platform's shared `DATABASE_URL`.

### Isolation model

- Every app-owned table carries (or, for `specification_versions`,
  denormalizes) an `appId` column with an index, so a repository query can
  never omit app scoping.
- `lib/repositories/authz.ts#assertCapability` is the single chokepoint: it
  loads the app, resolves the actor's effective role (owner, active
  collaborator, or platform superadmin), and checks it against the
  requested named capability — see the capability matrix above. Every
  repository method calls it first.
- SSO user ids (`ownerPrincipalId`, `principalId`, `*PrincipalId` columns)
  are stored as opaque external references — there is no foreign key from
  this database into the platform's `users` table, so AppBuilder's schema
  has zero cross-database dependency.
- Archival over deletion: apps are archived (`status`, `archivedAt`), not
  destroyed; specification versions, applied operations, and audit events
  are append-only/immutable.
- Retryable mutations are idempotent: `createApp` and `applyOperation` take
  an `idempotencyKey` and replay the original result for a repeated request
  instead of double-creating; a generic `idempotency_keys` table backs other
  create/mutate endpoints that don't have their own idempotency column.
- `specification_versions` additionally carries `parent_version_id` (the
  version it was built from — a plain column, not a Drizzle-level self-FK),
  `schema_version` / `engine_version` (which `@asafarim/appbuilder-schema`
  contract/engine produced this payload), and `summary` (a one-line,
  human-readable provenance note). `applied_operations` additionally
  carries `request_hash` (idempotency-payload verification) and
  `base_version_number` (the optimistic-concurrency audit trail).

### Backup and restore

Local/staging Postgres running under Docker Compose:

```bash
# Backup
docker compose exec appbuilder-postgres pg_dump -U appbuilder appbuilder > appbuilder-backup.sql

# Restore into a fresh database
docker compose exec -T appbuilder-postgres psql -U appbuilder appbuilder < appbuilder-backup.sql
```

Production (`docker-compose.prod.yml`, replace `<container>` with the
running `appbuilder-postgres` container name):

```bash
docker exec <container> pg_dump -U appbuilder appbuilder | gzip > appbuilder-$(date +%F).sql.gz
gunzip -c appbuilder-2026-07-21.sql.gz | docker exec -i <container> psql -U appbuilder appbuilder
```

### Migration rollback / recovery

Drizzle Kit migrations in this app are forward-only SQL files under
`lib/db/migrations/`; there is no generated "down" migration. To recover
from a bad migration:

1. Restore the most recent backup taken before the migration ran (see
   above), **or**
2. Hand-write and apply a corrective SQL migration (`pnpm db:generate` after
   fixing `lib/db/schema.ts`, or a manual file in `lib/db/migrations/`) that
   reverses the change — never edit an already-applied migration file in
   place, since Drizzle tracks applied migrations by filename/hash in its
   journal table.

Because every migration file only ever adds columns/tables/indexes in this
milestone, rerunning `db:migrate` against an already-migrated database is
always safe (verified in CI/verification — see the M02 PR).

## Docker

```bash
docker build -f apps/appbuilder/Dockerfile --target runner -t appbuilder .
docker run --rm -p 3006:3000 -e APPBUILDER_DATABASE_URL=... appbuilder
curl http://localhost:3006/api/health

# One-shot migration image (same one docker-compose.prod.yml's
# appbuilder-migrate job uses)
docker build -f apps/appbuilder/Dockerfile --target migrator -t appbuilder-migrate .
docker run --rm -e APPBUILDER_DATABASE_URL=... appbuilder-migrate
```

The app itself is not yet wired into `docker-compose.prod.yml` / Caddy —
that's production routing, explicitly deferred to M11. Its database and
migration job (`appbuilder-postgres`, `appbuilder-migrate`) are wired in now
so the persistence layer is already correct and testable ahead of that
milestone.
