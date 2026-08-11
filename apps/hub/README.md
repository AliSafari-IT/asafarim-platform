# ASafarIM Hub

The logged-in heart of the platform — one sign-in for every ASafarIM app.
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

Part of `docker-compose.prod.yml` — `hub` service, proxied by Caddy at
`https://hub.asafarim.com`. Built and deployed via
`infra/scripts/vps-deploy.sh`.
