# TasksAI (`@asafarim/tasks-ai`)

AI-native work execution — *from scattered intent to trusted execution*.
Dev port **3013** · domain `tasks-ai.asafarim.com`.

> **Status: early development (M01).** A deployable shell, not a launched or
> commercial product. See [`docs/charter.md`](docs/charter.md) and the
> milestone plan in [`docs/roadmap-implementation-plan.md`](docs/roadmap-implementation-plan.md).

## What exists after M01

- Next.js 16 app shell (public landing + authenticated `/workspace`), shared
  SSO via Hub, `@asafarim/ui` design system, `data-app="tasks-ai"` theming.
- **Dedicated PostgreSQL database** (isolated Prisma client under
  `lib/db/generated`), migration boundary, readiness probe.
- `/api/health` (web) and a BullMQ **worker skeleton** with a health
  heartbeat.
- Structured, secret-redacting logger.
- Unit tests (Vitest), integration-test harness (gated on a throwaway DB),
  Playwright smoke, and a dedicated CI workflow.

The multi-tenant work graph and `/api/v1` land in **M02**; the task
experience in **M03**.

## Commands

```bash
pnpm --filter @asafarim/tasks-ai dev            # web on :3013
pnpm --filter @asafarim/tasks-ai worker:dev     # background worker
pnpm --filter @asafarim/tasks-ai typecheck
pnpm --filter @asafarim/tasks-ai test           # unit only, DB-free
pnpm --filter @asafarim/tasks-ai test:integration   # needs TASKSAI_TEST_DATABASE_URL
pnpm --filter @asafarim/tasks-ai db:migrate     # prisma migrate dev
pnpm --filter @asafarim/tasks-ai e2e            # Playwright smoke
```

Local infra (Postgres :55438, Redis :6390):

```bash
pnpm db:up   # docker compose up -d  (brings up tasksai-postgres among others)
```

## Environment

Resolved and validated in [`lib/env.ts`](lib/env.ts). See
[`.env.example`](.env.example). Rules:

1. **Fail loudly** — missing `TASKSAI_DATABASE_URL` in staging/production
   stops boot.
2. **No shared-DB fallback** — TasksAI never falls back to the platform
   `DATABASE_URL`, and refuses a `TASKSAI_DATABASE_URL` byte-identical to it
   ([`docs/adr/0001-dedicated-database.md`](docs/adr/0001-dedicated-database.md)).
3. **Never echo values** — errors name the variable, never its contents.

## Deployment

See [`docs/deploy-plan.md`](docs/deploy-plan.md). Docker stages: `builder`,
`migrator` (one-shot `prisma migrate deploy`), `worker`, `runner`.
