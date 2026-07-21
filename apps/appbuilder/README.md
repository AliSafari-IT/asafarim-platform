# AppBuilder

Metadata-driven AI application factory (`appbuilder.asafarim.com`). Users
describe an internal business application, receive a controlled/versioned
application specification, preview it at `/apps/{appId}/preview`, refine it
conversationally, validate it, and publish an immutable release.

This is **M02** of the delivery series tracked in
[issue #29](https://github.com/AliSafari-IT/asafarim-platform/issues/29):
AppBuilder's dedicated PostgreSQL service, migrations, and repository
boundary. See
[docs/adr/0001-appbuilder-managed-runtime.md](../../docs/adr/0001-appbuilder-managed-runtime.md)
for the architectural decision this scaffold builds on, and
[docs/appbuilder-architecture.md](../../docs/appbuilder-architecture.md) for
the route contracts and milestone map.

## What's here (M01 + M02)

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

## What's explicitly not here yet

- Platform SSO / authorization (M03) — actor identity is currently supplied
  directly by callers (`{ principalId }`); wiring it to the real session is
  M03's job.
- The finalized application-specification operation engine (M04) —
  `applyOperation` accepts an opaque JSON payload today.
- AI generation, the template/component registry, and the preview runtime
  (M05–M07).
- Production routing / deployment of AppBuilder itself, and any per-generated-app
  deployment (M11).

## Development

```bash
pnpm --filter @asafarim/appbuilder dev      # http://localhost:3006
pnpm --filter @asafarim/appbuilder build
pnpm --filter @asafarim/appbuilder typecheck
pnpm --filter @asafarim/appbuilder lint
pnpm --filter @asafarim/appbuilder test              # unit only, no database needed
pnpm --filter @asafarim/appbuilder test:integration  # requires appbuilder-postgres running
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
- `lib/repositories/authz.ts#assertAppAccess` is the single chokepoint: it
  loads the app, checks the caller is the owner or an active collaborator
  meeting the required role, and throws `NotFoundError` /
  `ForbiddenError` otherwise. Every repository method calls it first.
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
