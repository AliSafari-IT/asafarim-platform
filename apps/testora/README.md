# e2e-testora

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

`e2e-testora` is an end-to-end testing orchestration app that provides:
- a web UI (Next.js) to manage test suites, fixtures, and runs
- API routes for creating and running tests programmatically
- a small test-engine for generating and executing test scenarios

The project is intended for local development and CI integration to run deterministic E2E tests.

## Latest Update

- **Privacy banner dismissal for UI tests**: shared browser login and admin smoke helpers (`src/data/_admin-shared.ts`) now automatically click any visible **Accept all** cookie/privacy banner before running assertions; profile and navbar dropdown tests (`src/data/profile.ts`) do the same after navigation. This fixes false failures where the banner obscured tab content and other UI elements.

## Tech Stack
- **Framework**: `Next.js` (app router)
- **Language**: `TypeScript`
- **Styling**: `Tailwind CSS`
- **DB / ORM**: `Drizzle` (see `src/db/`)
- **Package manager**: `pnpm`
- **Runtime / Tools**: Node.js, `pnpm` scripts, and Docker (optional)

## Prerequisites
- Node.js (v16+ recommended)
- `pnpm` installed globally
- A working SQL database (the project uses the `src/db/` folder and Drizzle migration scripts)

## Quick Start

1. Clone the repo:

```bash
git clone <repo-url> e2e-testora
cd e2e-testora
```

2. Install dependencies:

```bash
pnpm install
```

3. Create environment variables
- Copy an `.env.example` to `.env` and fill values (if the repo includes one). If not present, ensure `DATABASE_URL` points to your SQL database and any required secrets are set.

4. Database setup
- Run migrations and seed the database. There are helper scripts in `src/db/`.

```bash
# If project provides scripts:
pnpm run db:migrate || tsx src/db/migrate.ts
pnpm run db:seed || tsx src/db/seed.ts
```

5. Start the dev server:

```bash
pnpm dev
# or
pnpm run dev
```

Open http://localhost:3000 in your browser.

## Development Commands
- **Install deps**: `pnpm install`
- **Dev server**: `pnpm dev` or `pnpm run dev`
- **Build**: `pnpm build` or `pnpm run build`
- **Start**: `pnpm start` or `pnpm run start`
- **Type check**: `pnpm typecheck`
- **Lint**: `pnpm lint`
- **Clean `.next`**: `pnpm clean`
- **Database**: `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:studio`, `pnpm db:seed`
- **Run E2E suite**: `pnpm test:e2e`

If a script is not present in `package.json`, run the underlying script files in `src/db/` directly (e.g., `tsx src/db/seed.ts`). See [package.json](package.json) for available scripts.

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
- Dev server fails to start: ensure Node version and `pnpm` are correct and `DATABASE_URL` is set.
- DB migration/seed errors: confirm DB is reachable and has correct privileges.
- If you see TypeScript or build errors, run `pnpm build` locally to reproduce.

## Deployment

Production deployment targets the VPS at `testora.asafarim.com` and is managed by the files in `deploy/` and `scripts/`.

### Components
- **App** — `next start` on `127.0.0.1:3007` via systemd `e2e-testora`
- **Database** — Postgres in Docker, bound to `127.0.0.1:55434` only
- **Reverse proxy** — nginx with TLS via Let's Encrypt
- **Test runs** — TestCafe drives the host's Google Chrome

### Key files
| File | Purpose |
|---|---|
| `scripts/server-setup.sh` | One-time idempotent provisioning |
| `scripts/deploy.sh` | Repeatable redeploy |
| `deploy/docker-compose.prod.yml` | Production Postgres container |
| `deploy/e2e-testora.service` | systemd unit for the app |
| `deploy/nginx/testora.asafarim.com.conf` | nginx TLS vhost |

### First-time setup
Run on the VPS as root:
```bash
bash /var/repos/e2e-testora/scripts/server-setup.sh
# Then edit env vars and restart:
nano /var/repos/e2e-testora/.env   # DATABASE_URL, WEBAPP_ADMIN_*, etc.
systemctl restart e2e-testora
```

### Redeploy after changes
```bash
ssh vps 'bash /var/repos/e2e-testora/scripts/deploy.sh'
```

### Operations
```bash
systemctl status e2e-testora          # service health
journalctl -u e2e-testora -f            # live logs
docker logs -f e2e-testora-db           # database logs
curl -I https://testora.asafarim.com    # public check
```

## License & Credits
- This project uses common OSS tools: Next.js, Tailwind CSS, Drizzle, and `pnpm`.
- Released under the [MIT License](LICENSE) — you're free to use, modify, and distribute it,
  including commercially. The software is provided **"as is"**, without warranty of any kind; the
  author accepts no liability for any damage, data loss, or other problems arising from its use.
