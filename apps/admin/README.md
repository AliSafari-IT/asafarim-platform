# ASafarIM Admin

Internal admin panel for platform operations — user management, RBAC,
audit logs, platform settings, seed data, and live system metrics.
Lives at [admin.asafarim.com](https://admin.asafarim.com), local dev on
port **3003**. Access requires `admin` or `superadmin` role.

## What's here

- **Dashboard** (`/`) — live platform counts (users, active users, roles,
  permissions, audit events today) and Redis queue depth probes for
  background workers.
- **Users** (`/users`) — user directory with search, role assignment,
  activation/deactivation, and profile inspection.
- **Roles** (`/roles`) — RBAC role management: create roles, assign
  permissions, view role membership.
- **Permissions** (`/permissions`) — permission registry and
  role-permission matrix.
- **Access control** (`/access-control`) — platform app access
  configuration per role.
- **Audit logs** (`/audit-logs`) — append-only audit event viewer with
  filtering by actor, action, and date range.
- **Seed data** (`/seed-data`) — admin-facing seed data management
  powered by `@asafarim/seed-manager`.
- **Settings** (`/settings`) — platform-wide settings
  (`PlatformSetting` key/value store).
- **Devices** (`/devices`) — session/device management.
- **Subscriptions** (`/subscriptions`) — subscription overview.

## Stack

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS
- Auth.js v5 via `@asafarim/auth` (shared SSO session, admin role gate)
- Prisma/Postgres via `@asafarim/db`
- `@asafarim/seed-manager` for typed seed data providers
- `@asafarim/ui` for the design system (`DataTable`, `FilterBar`,
  `BulkActionBar`, `Metric`, `Panel`, `StatusBadge`, `Pagination`)
- `ioredis` for queue depth probing
- `@asafarim/shared-i18n` + `@asafarim/country-language-selector`

## Development

```bash
pnpm --filter @asafarim/admin dev      # http://localhost:3003
pnpm --filter @asafarim/admin build
pnpm --filter @asafarim/admin typecheck
```

### Auth and access control

`proxy.ts` uses `createAuthProxy` with public routes
`["/sign-in", "/denied", "/api/health"]`. The `(admin)` route group
layout calls `requireRole("ADMIN")` server-side — non-admin users are
redirected to `/denied` with a readable message. Superadmin always
passes.

### Environment

Admin reads the shared root `.env.local`. Key variables: `DATABASE_URL`,
`AUTH_SECRET`, `AUTH_URL`, `REDIS_URL` (for queue depth probes),
`NEXT_PUBLIC_*_URL`.

### Database

Uses the shared platform Postgres via `@asafarim/db`/Prisma — no
separate database. From the repo root:

```bash
pnpm db:migrate       # applies pending migrations
pnpm db:seed          # seeds RBAC roles/permissions + initial admin user
```

The seed creates an admin user from `SEED_ADMIN_EMAIL` /
`SEED_ADMIN_PASSWORD` — needed to sign in to the admin panel in
development.

## Deployment

Part of `docker-compose.prod.yml` — `admin` service, proxied by Caddy
at `https://admin.asafarim.com`. Built and deployed via
`infra/scripts/vps-deploy.sh`.
