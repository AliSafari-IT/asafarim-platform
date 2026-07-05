# ASafarIM Platform

Unified monorepo for all **ASafarIM Digital** apps and services: the public
website, the ASafarIM Hub dashboard, the Showcase, the Admin panel, and shared
packages — built with Next.js, TypeScript, PostgreSQL, pnpm workspaces, and
Turborepo, deployed with Docker Compose behind Caddy.

See [docs/migration-plan.md](docs/migration-plan.md) for the full plan and
[docs/architecture.md](docs/architecture.md) for the current structure.

## Apps

| App              | Purpose                        | Dev port | Target domain          | Access                      |
| ---------------- | ------------------------------ | -------- | ---------------------- | --------------------------- |
| `apps/web`       | Public ASafarIM Digital site   | 3000     | asafarim.com           | Public                      |
| `apps/hub`       | Logged-in user dashboard       | 3001     | hub.asafarim.com       | Login for dashboard/apps/profile/settings |
| `apps/showcase`  | Public demos and case studies  | 3002     | showcase.asafarim.be   | Public                      |
| `apps/admin`     | Internal admin panel           | 3003     | admin.asafarim.com     | admin / superadmin role     |

## Packages

| Package             | Purpose                                          |
| ------------------- | ------------------------------------------------ |
| `packages/ui`       | Shared React UI components                       |
| `packages/auth`     | Shared authentication helpers (Phase 5)          |
| `packages/db`       | Prisma client, schema, and migrations (Phase 4)  |
| `packages/config`   | Shared TypeScript/ESLint/Tailwind configuration  |

## Getting started

Requirements: Node.js >= 22 and pnpm >= 11 (`corepack enable`).

```bash
pnpm install
pnpm dev        # run all apps in dev mode
pnpm build      # build all apps and packages
pnpm typecheck  # typecheck the whole workspace
```

### Environment

Copy `.env.local.example` to `.env` at the repo root — apps load it via
`next.config.ts`, Prisma via `dotenv-cli`. For the VPS, use
`.env.production.example` as the template. Never commit a real `.env`.

### Database

With the root `.env` in place:

```bash
docker compose up -d postgres   # local PostgreSQL on port 55435
pnpm db:migrate                 # apply Prisma migrations
pnpm db:seed                    # seed RBAC roles/permissions (+ SEED_ADMIN_* user)
pnpm db:studio                  # browse the database
```

Authentication (Auth.js v5) lives in `packages/auth`; sign in at
`hub:3001/sign-in`, admin-only area at `admin:3003`.

## Deployment

Production runs on a VPS via Docker Compose and Caddy:

```bash
pnpm deploy:prod
```

See [docs/deployment.md](docs/deployment.md) for VPS setup details.
