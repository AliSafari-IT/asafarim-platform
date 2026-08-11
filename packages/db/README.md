# @asafarim/db

Shared PostgreSQL/Prisma database package for the ASafarIM Platform.
Every app that uses the shared platform database (web, hub, admin,
vionto, edumatch, timelineai) imports the Prisma client and generated
types from here. Apps with isolated databases (AppBuilder, Testora) use
their own Drizzle schemas and do not import this package for product
data.

## What's here

- **Prisma client** (`src/client.ts`) — singleton `prisma` instance
  (also exported as `db` alias).
- **Schema** (`prisma/schema.prisma`) — the full platform data model:
  `User`, `Account`, `Session`, `VerificationToken`, `EmailLoginCode`,
  `Role`, `Permission`, `UserRole`, `RolePermission`, `AuditLog`,
  `PlatformSetting`, `EduStudentProfile`, `EduTutorProfile`,
  `EduBooking`, `EduTransaction`, `Timeline`, `TimelineEvent`,
  `TimelineModerationEvent`.
- **Migrations** (`prisma/migrations/`) — Prisma migration history.
- **Seed scripts** — `prisma/seed.ts` (RBAC roles/permissions + initial
  admin user), `prisma/seed-edumatch.ts` (EduMatch fixtures),
  `prisma/seed-timelineai.ts` (TimelineAI demo timelines).
- **Generated types** — re-exports all Prisma model types for
  convenient imports.

## Scripts

```bash
pnpm --filter @asafarim/db db:generate          # prisma generate
pnpm --filter @asafarim/db db:migrate            # prisma migrate dev (local)
pnpm --filter @asafarim/db db:migrate:deploy     # prisma migrate deploy (CI)
pnpm --filter @asafarim/db db:migrate:deploy:prod  # production migration
pnpm --filter @asafarim/db db:push               # prisma db push (sandbox)
pnpm --filter @asafarim/db db:studio             # prisma studio on :5555
pnpm --filter @asafarim/db db:seed               # roles + permissions + admin user
pnpm --filter @asafarim/db db:seed:edumatch      # edumatch fixtures
pnpm --filter @asafarim/db db:seed:timelineai    # timelineai demo timelines
```

Or from the repo root:

```bash
pnpm db:migrate
pnpm db:seed
pnpm db:studio
```

## Environment

`DATABASE_URL` must point to the shared platform PostgreSQL instance.
Local dev runs via `docker compose up -d postgres` (port 55435).
Production uses the `postgres` service in `docker-compose.prod.yml`.

## Deployment

The `platform-migrate` one-shot job in `docker-compose.prod.yml` builds
from `packages/db/Dockerfile` (target: `migrator`) and runs
`prisma migrate deploy` + TimelineAI seed before any app container
starts.
