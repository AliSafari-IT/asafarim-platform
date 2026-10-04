# ASafariM Hub

The logged-in heart of the platform — one sign-in for every ASafariM app.
Launch apps from the app switcher, manage your profile and identity, and
keep settings in one place. Lives at [hub.asafarim.com](https://hub.asafarim.com),
local dev on port **3001**.

## What's here

- **Centralized sign-in** — Auth.js v5 credentials provider, email-code
  login, and user registration. Every other app redirects here for
  authentication via `@asafarim/auth`'s shared session cookie.
- **App launcher** (`/apps`) — a grid of every platform app the signed-in
  user can access, driven by `@asafarim/auth`'s `PLATFORM_APPS` registry
  and `getAccessibleApps()`.
- **Dashboard** (`/dashboard`) — personalized landing page after sign-in.
- **Profile** (`/profile`) — update name, email, password, and manage
  saved locations (`@asafarim/auth`'s `updateUserProfile` /
  `listUserLocations` APIs).
- **Settings** (`/settings`) — account preferences.
- **Sign-up** (`/sign-up`) — new account registration with username
  generation (`@asafarim/auth`'s `generateUniqueUsername`).
- **API routes** — `/api/auth/[...nextauth]` (Auth.js handlers),
  `/api/profile/*` (profile + location CRUD), `/api/storage/*` (presigned
  upload URLs via `@asafarim/storage`).

## Stack

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS
- Auth.js v5 via `@asafarim/auth` (JWT strategy, shared `.asafarim.com`
  cookie in production, `localhost` cookie domain in dev)
- Prisma/Postgres via `@asafarim/db`
- `@asafarim/ui` for the design system (`AppShell`, `TopNav`, `Hero`,
  `ButtonLink`, `Card`)
- `@asafarim/shared-i18n` + `@asafarim/country-language-selector` for
  locale resolution and the country/language picker
- `@asafarim/storage` for S3-compatible object storage

## Development

```bash
pnpm --filter @asafarim/hub dev      # http://localhost:3001
pnpm --filter @asafarim/hub build
pnpm --filter @asafarim/hub typecheck
```

### Auth proxy

`proxy.ts` uses `createAuthProxy` from `@asafarim/auth/proxy` with
public routes `["/", "/sign-in", "/sign-up", "/api/health"]`. Every
other route requires an active session; unauthenticated HTML requests
redirect to `/sign-in`, API requests get `401` JSON.

### Environment

Hub reads the shared root `.env.local` (see repo-root
`.env.local.example`). Key variables: `DATABASE_URL`, `AUTH_SECRET`,
`AUTH_URL`, `NEXT_PUBLIC_*_URL` for every app's public URL.

## Deployment

Hub is deployed as part of the ASafariM Platform using Docker Compose and Caddy:

- **App container** — built from `apps/hub/Dockerfile` (Next.js standalone), proxied by Caddy at `https://hub.asafarim.com`
- **Database** — shared PostgreSQL via `@asafarim/db`
- **Auth** — Auth.js v5 via `@asafarim/auth` (centralized sign-in for all apps)

Production deployment is managed from the repo root:

```bash
pnpm deploy:prod
```

See [docs/deployment.md](../../docs/deployment.md) for VPS setup details and the full deployment pipeline.

## End-to-end tests (hand-off)

`pnpm --filter @asafarim/hub e2e` runs `e2e/handoff.spec.ts` in a real browser: real Hub and sign-in, a stub identity service (`e2e/stubs/identity.ts`, the contract in asafarim-os `core/identity/README.md`) and a fake app on another origin. It needs a migrated and seeded database (`pnpm db:migrate:deploy && pnpm db:seed` with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`) and `AUTH_SECRET`. Test keys are generated per run; ports 3901/3902 are configurable with `E2E_IDENTITY_PORT` / `E2E_APP_PORT`. The `@chromium-only` canary pins that Chromium blocks a redirect after Hub's assertion POST (`form-action`); if it ever passes through, Hub's CSP has loosened.
