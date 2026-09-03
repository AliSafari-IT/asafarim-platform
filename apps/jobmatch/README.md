# JobMatch

An explainable, source-transparent job-search assistant: fewer vacancies,
each with the reason it fits. Runs at `jobmatch.asafarim.com`, port 3012 in
local development.

**Status: M1 — platform and delivery foundation.** There is no job source,
no CV upload, and no matching. What exists is the boundary the rest gets
built inside. See [`docs/business-plan.md`](docs/business-plan.md) for the
milestone sequence and [`docs/threat-model.md`](docs/threat-model.md) for
what M1 does and does not defend against.

## What M1 delivers

- A deployable Next.js app registered in the platform registry, app
  switcher, Caddy routing, and the production compose stack.
- Shared sign-in through Hub. JobMatch reads the platform session and never
  stores a credential of its own.
- Its own PostgreSQL instance (pgvector image, ready for M5's embeddings)
  with its own credentials, holding an opaque platform user id rather than a
  copy of the platform user table.
- A validated environment contract that refuses to boot staging or
  production without an explicit `JOBMATCH_DATABASE_URL`.
- Redaction-by-construction logging and an append-only audit table.
- CI covering typecheck, unit tests, migration apply, and schema drift.

## Local development

```bash
docker compose up -d jobmatch-postgres
```

```bash
pnpm --filter @asafarim/jobmatch db:migrate
```

```bash
pnpm --filter @asafarim/jobmatch dev
```

Then open <http://localhost:3012>. `/workspace` redirects to Hub's sign-in
(run `pnpm --filter @asafarim/hub dev` too) and comes back with a workspace
created on first visit.

```bash
pnpm --filter @asafarim/jobmatch test
```

## Environment

| Variable | Required in | Notes |
|---|---|---|
| `JOBMATCH_DATABASE_URL` | staging, production | No fallback to the platform `DATABASE_URL` — a missing value fails startup rather than silently using the identity database. Local development defaults to `localhost:55437`. |
| `JOBMATCH_SHADOW_DATABASE_URL` | CI only | Throwaway database for the migration drift check. |
| `JOBMATCH_ENVIRONMENT` | staging, production | `staging` there, `production` in prod; it decides whether secrets may be defaulted. |
| `NEXT_PUBLIC_JOBMATCH_URL` | all deployments | Inlined at build time; also an allowed SSO callback origin. |
| `NEXT_PUBLIC_HUB_URL` | all deployments | Where unauthenticated visitors are sent to sign in. |

Production additionally needs `JOBMATCH_DB_PASSWORD` and its URL-encoded
form `JOBMATCH_DB_PASSWORD_URL` in `.env.production`, following the same
convention as AppBuilder and Testora.

## Why a separate database

Job listings are high-volume and rewritten constantly by ingestion; CV-derived
data needs a stricter access boundary than identity traffic; and embedding
indexes grow fast. Mixing that into the shared platform Postgres would put
search and ingestion load onto identity transactions. The full rationale is
in the business plan under "Database recommendation".

JobMatch's Prisma client is generated into `lib/db/generated` rather than
`node_modules/@prisma/client`, because pnpm symlinks that path to the shared
store where the *platform* client lives. Both clients coexist in one process
only because of that split.
