# Architecture

## Overview

The ASafarIM Platform is a pnpm + Turborepo monorepo containing all
ASafarIM Digital apps and shared packages. It is the clean restructure and
future replacement of the `asafarim-digital` repo (see
[migration-notes.md](migration-notes.md)).

```txt
asafarim-platform/
├─ apps/
│  ├─ web/                 # Public website (asafarim.com)
│  ├─ hub/                 # Logged-in dashboard (hub.asafarim.com)
│  ├─ showcase/            # Public showcase (showcase.asafarim.be)
│  └─ admin/               # Admin panel (admin.asafarim.com)
├─ packages/
│  ├─ ui/                  # Shared React UI components + nav shell
│  ├─ auth/                # Auth.js v5: providers, helpers, middleware
│  ├─ db/                  # Prisma 7 + PostgreSQL: schema, migrations, seed
│  └─ config/              # Shared TypeScript config
├─ infra/
│  ├─ caddy/               # Caddyfile for reverse proxy + HTTPS
│  └─ scripts/             # deploy-prod.sh
├─ docker-compose.yml      # Local dev services (PostgreSQL on port 55435)
├─ docker-compose.prod.yml # Full production stack
└─ turbo.json              # Build orchestration
```

## Apps, routes, and protection

All apps are Next.js (App Router, TypeScript, `output: "standalone"`), each
with its own Dockerfile building from the monorepo root context.

| App | Dev URL | Production | Routes | Protection |
| --- | --- | --- | --- | --- |
| web | localhost:3000 | asafarim.com | `/`, `/about`, `/services`, `/projects`, `/contact`, `/privacy`, `/terms` | Public |
| hub | localhost:3001 | hub.asafarim.com | `/`, `/sign-in`, `/dashboard`, `/apps`, `/profile`, `/settings` | `/dashboard`, `/apps`, `/profile`, `/settings` require login |
| showcase | localhost:3002 | showcase.asafarim.be | `/`, `/projects`, `/projects/[slug]`, `/labs` | Public |
| admin | localhost:3003 | admin.asafarim.com | `/`, `/users`, `/roles`, `/permissions`, `/audit-logs`, `/settings`, `/denied`, `/sign-in` | Everything except `/sign-in` and `/denied` requires the **admin** or **superadmin** role |

Protection is layered:

1. **Middleware** (`createAuthMiddleware` from `@asafarim/auth/middleware`) —
   redirects unauthenticated page requests to `/sign-in?callbackUrl=…` and
   returns 401 JSON for API routes.
2. **Layout/page guards** — `requireUser()` and `requireRole([ROLES.ADMIN])`
   from `@asafarim/auth`. The admin app wraps all admin routes in an
   `(admin)` route-group layout that calls `requireRole`; authenticated
   non-admins land on `/denied`.

## Auth flow

- Auth.js v5, JWT session strategy (no DB adapter; the `jwt` callback syncs
  user + roles from PostgreSQL via `ensureAuthUser`).
- Providers: email/password credentials (bcrypt), email one-time code (OTP),
  Google OAuth (when `AUTH_GOOGLE_ID/SECRET` set).
- Sessions are shared across apps via the cookie domain:
  `AUTH_COOKIE_DOMAIN=.asafarim.com` in production, `localhost` in dev
  (works across ports — sign in on hub, be signed in on admin).
- Roles come from the RBAC tables (`Role`, `UserRole`); `superadmin` bypasses
  all role and permission checks.

Helper surface (`@asafarim/auth`):

```ts
import {
  auth, signIn, signOut,          // Auth.js primitives
  getSession, requireUser, requireRole,
  ROLES, hasRole, isAdmin,
  hasPermission, getUserPermissions,
} from "@asafarim/auth";
```

## Shared packages

- `@asafarim/ui` — the platform design system: CSS design tokens with
  per-app moods (`data-app` attribute), brand components, layout shell, and
  creative building blocks. See [design-system.md](design-system.md).
  Shipped as TS source + `@asafarim/ui/styles.css`; apps transpile via
  `transpilePackages`.
- `@asafarim/auth` — see auth flow above.
- `@asafarim/db` — Prisma 7 + `@prisma/adapter-pg`. Foundation models: User,
  Account, Session, VerificationToken, EmailLoginCode, Role, Permission,
  UserRole, RolePermission, AuditLog. Seed creates 19 permissions, 4 system
  roles, and an optional superadmin from `SEED_ADMIN_*`.
- `@asafarim/config` — shared `tsconfig` bases.

## Cross-app navigation

Apps link to each other via `getPlatformLinks()`, driven by env vars with
localhost fallbacks:

```env
NEXT_PUBLIC_WEB_URL=http://localhost:3000
NEXT_PUBLIC_HUB_URL=http://localhost:3001
NEXT_PUBLIC_SHOWCASE_URL=http://localhost:3002
NEXT_PUBLIC_ADMIN_URL=http://localhost:3003
```

Production values use the real domains (see `.env.production.example`).
Because `NEXT_PUBLIC_*` values are inlined at build time, each app loads the
root `.env` in `next.config.ts`.

## Environment files

- `.env.local.example` — localhost URLs, dev database (port 55435), dev auth
- `.env.production.example` — real domains, SSO cookie domain, VPS database
- Copy the appropriate one to `.env` at the repo root. Apps read it via
  `next.config.ts`; Prisma reads it via `dotenv-cli` in `packages/db` scripts.

## Data

PostgreSQL 16 is the single source of truth; Prisma manages schema and
migrations from `packages/db`. Product-specific models (showcase items,
content, contact messages, and later Vionto/EduMatch models) are added in
later migration phases.
