# Architecture

## Overview

The ASafarIM Platform is a pnpm + Turborepo monorepo containing all
ASafarIM Digital apps and shared packages.

```txt
asafarim-platform/
├─ apps/
│  ├─ web/                 # Public website (asafarim.com)
│  ├─ hub/                 # Logged-in dashboard (hub.asafarim.com)
│  ├─ showcase/            # Public showcase (showcase.asafarim.be)
│  └─ admin/               # Admin panel (admin.asafarim.com)
├─ packages/
│  ├─ ui/                  # Shared React UI components
│  ├─ auth/                # Shared authentication helpers (placeholder)
│  ├─ db/                  # Prisma + PostgreSQL access (placeholder)
│  └─ config/              # Shared TypeScript config
├─ infra/
│  ├─ caddy/               # Caddyfile for reverse proxy + HTTPS
│  └─ scripts/             # deploy-prod.sh
├─ docker-compose.yml      # Local dev services (PostgreSQL)
├─ docker-compose.prod.yml # Full production stack
└─ turbo.json              # Build orchestration
```

## Apps

All apps are Next.js (App Router, TypeScript) with `output: "standalone"` so
each can be packaged into a small Docker image. Each app has its own
Dockerfile at `apps/<name>/Dockerfile` that builds from the monorepo root
context.

Dev ports: web 3000, hub 3001, showcase 3002, admin 3003.

## Shared packages

- `@asafarim/ui` — React components shipped as TypeScript source; apps
  transpile it via `transpilePackages` in `next.config.ts`.
- `@asafarim/config` — shared `tsconfig` bases (`base`, `nextjs`,
  `react-library`). ESLint and Tailwind presets will be added here later.
- `@asafarim/db` — placeholder; Phase 4 adds Prisma schema, migrations, and a
  reusable client (`import { db } from "@asafarim/db"`).
- `@asafarim/auth` — placeholder; Phase 5 adds Auth.js-based shared
  authentication (`import { authOptions } from "@asafarim/auth"`).

## Domain plan

```txt
asafarim.com / www.asafarim.com → apps/web
hub.asafarim.com                → apps/hub
admin.asafarim.com              → apps/admin
showcase.asafarim.be            → apps/showcase
api.asafarim.com                → future apps/api (or route handlers)
auth.asafarim.com               → future SSO provider (Authentik)
labs.asafarim.be                → future experimental apps
```

## Authentication strategy

Phase 1 uses Auth.js inside the monorepo (single sign-on across
`*.asafarim.com` subdomains via a shared cookie domain). True cross-domain SSO
between `.com` and `.be` requires an OIDC provider (Authentik/Keycloak) and is
deferred to a later phase.

## Data

PostgreSQL 16 is the single source of truth. Prisma manages the schema and
migrations from `packages/db`. Planned initial models: User, Account, Session,
Project, ShowcaseItem, App, Role, Permission, AuditLog, ContactMessage.
