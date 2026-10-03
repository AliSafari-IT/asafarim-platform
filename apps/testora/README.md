# Testora

> End-to-end testing orchestration and runner built with Next.js, Drizzle, and a lightweight test-engine.

## Table of Contents
- **Overview**: Short project description and goals.
- **Latest Update**: Recent project changes.
- **Tech Stack**: Key technologies used.
- **Quick Start**: Install, configure, and run locally.
- **Database**: Migrations and seeding instructions.
- **Development**: Common developer commands.
- **API & Architecture**: Where code lives and how it works.
- **Contributing**: How to help.
- **Troubleshooting**: Common issues and fixes.
- **Deployment**: VPS deployment scripts and ops.

## Overview

Testora is an end-to-end testing orchestration app in the ASafariM Platform that provides:
- a web UI (Next.js) to manage test suites, fixtures, and runs
- API routes for creating and running tests programmatically
- a small test-engine for generating and executing test scenarios

The app is intended for local development and CI integration to run deterministic E2E tests. It uses an isolated PostgreSQL database and integrates with TasksAI for autonomous quality loops.

## Latest Update

- **Role-based access control**: Admin-only operations (like "Update tests") now require proper permissions
- **Member bug reports**: Users can report bugs with duplicate detection
- **Testora-TasksAI integration**: Autonomous quality loop with cross-app contract and HMAC signing
- **Runner capacity management**: Added runner capacity tracking and scheduling
- **Access policy framework**: Comprehensive access control for different user roles

## Tech Stack
- **Framework**: `Next.js` (app router)
- **Language**: `TypeScript`
- **Styling**: `Tailwind CSS`
- **DB / ORM**: `Drizzle` (isolated PostgreSQL database)
- **Auth**: Auth.js v5 (shared via `@asafarim/auth`; sign-in centralized on the Hub)
- **Package manager**: `pnpm`
- **Runtime / Tools**: Node.js, `pnpm` scripts, and Docker Compose (for local Postgres)

## Prerequisites
- Node.js (v16+ recommended)
- `pnpm` installed globally
- A working SQL database (the project uses the `src/db/` folder and Drizzle migration scripts)

## Quick Start

Testora is part of the ASafariM Platform monorepo. Development is done from the repo root:

```bash
# From the repo root
pnpm install                    # install all workspace dependencies
pnpm dev                        # run all apps (Testora on :3005)
```

For Testora-specific development:

```bash
pnpm --filter testora dev       # run only Testora (web :3005)
```

Local URL: `http://localhost:3005`

## Environment Variables

Configuration is managed at the repo root in `.env.local`. Testora uses the shared platform database and authentication via `@asafarim/auth`. For its isolated database, ensure `TESTORA_DATABASE_URL` is set in the environment.

## Development Commands

From the repo root:
- **Install deps**: `pnpm install`
- **Dev server**: `pnpm dev` (all apps) or `pnpm --filter testora dev` (Testora only)
- **Build**: `pnpm build` (all apps) or `pnpm --filter testora build` (Testora only)
- **Type check**: `pnpm typecheck` (all apps) or `pnpm --filter testora typecheck` (Testora only)
- **Lint**: `pnpm lint` (all apps) or `pnpm --filter testora lint` (Testora only)

Testora-specific database commands (from repo root):
- **Database migrations**: `pnpm --filter @asafarim/testora db:migrate`
- **Database seed**: `pnpm --filter @asafarim/testora db:seed`
- **Database studio**: `pnpm --filter @asafarim/testora db:studio`

## Database
- Migrations and helpers live in the `src/db/` folder: see [src/db/migrate.ts](src/db/migrate.ts) and [src/db/seed.ts](src/db/seed.ts).
- The codebase uses Drizzle; ensure `DATABASE_URL` points to your DB for migrations and runtime.

## API & Architecture
- API routes live under `src/app/api/` (example: [src/app/api/cases/route.ts](src/app/api/cases/route.ts) and [src/app/api/run/route.ts](src/app/api/run/route.ts)).
- UI pages and components are in `src/app/` and `src/components/`.
- The test engine and generators are under `src/test-engine/` — look at [src/test-engine/run.ts](src/test-engine/run.ts) and [src/test-engine/executors/](src/test-engine/executors/) for execution flow.

High-level flow:
1. Create fixtures / suites via the UI or the API
2. Trigger a run via the API or UI
3. The test-engine executes scenarios and returns structured results
4. Results are persisted to the database and viewable in the UI

### Testora ↔ TasksAI integration

The autonomous quality loop between Testora and TasksAI (epic
[#269](https://github.com/AliSafari-IT/asafarim-platform/issues/269)) crosses
an app boundary with isolated databases. The trust boundary, signing scheme,
data-minimisation rules and versioned payload schemas are defined in
[`docs/testora-tasksai-contract.md`](../../docs/testora-tasksai-contract.md)
and [ADR 0002](../../docs/adr/0002-testora-tasksai-trust-boundary.md), with the
schemas shipped in
[`@asafarim/testora-tasksai-contract`](../../packages/testora-tasksai-contract).

## Useful File References
- `package.json`: project scripts and deps — [package.json](package.json)
- DB helpers: [src/db/migrate.ts](src/db/migrate.ts), [src/db/seed.ts](src/db/seed.ts)
- API samples: [src/app/api/cases/route.ts](src/app/api/cases/route.ts), [src/app/api/run/route.ts](src/app/api/run/route.ts)
- UI entry: [src/app/page.tsx](src/app/page.tsx), layout: [src/app/layout.tsx](src/app/layout.tsx)

## Testing

The repository includes a `src/test-engine/` directory with generators and executors. Running end-to-end scenarios can be done through the UI or by POSTing to the run API endpoints.

Automated tests (unit / integration) are not included by default — add your preferred test runner (Vitest, Jest, Playwright) and create CI steps as needed.

## Contributing
- Fork the repo, create a feature branch, and open a PR describing your change.
- Run `pnpm install` and the dev server locally to validate UI/workflows.

## Troubleshooting
- Dev server fails to start: ensure Node.js >= 22 and pnpm >= 11 are installed, and the repo root `.env.local` is configured
- Database errors: ensure PostgreSQL is running (`docker compose up -d postgres`) and both shared and isolated database URLs are set
- Auth errors: verify `@asafarim/auth` package is properly configured and Hub sign-in is accessible
- TypeScript or build errors: run `pnpm --filter testora build` locally to reproduce

## Deployment

Testora is deployed as part of the ASafariM Platform using Docker Compose and Caddy:

- **App container** — built from `apps/testora/Dockerfile` (Next.js standalone), proxied by Caddy at `https://testora.asafarim.com`
- **Database** — isolated PostgreSQL in Docker
- **Auth** — shared session via `@asafarim/auth` (sign-in on Hub)

Production deployment is managed from the repo root:

```bash
pnpm deploy:prod
```

See [docs/deployment.md](../../docs/deployment.md) for VPS setup details and the full deployment pipeline.

## License

This repository is part of the ASafariM Platform, a **portfolio project** shared publicly for skills assessment. It is licensed under a custom **Portfolio Evaluation & Source-Available License** — see the main [`LICENSE`](../../LICENSE) for the full legal text.

**Permitted:**
- 👀 Viewing and reading the source code
- 📥 Cloning the repository for local inspection
- 🖥️ Building and running the project locally for evaluation

**Forbidden without prior written consent:**
- 🚫 Commercial use of any kind
- 🚫 Selling, renting, or paid distribution
- 🚫 Sublicensing or redistributing the code
- 🚫 Modifying to create commercial derivative works

For commercial licensing, contact: **asafarim@gmail.com**
