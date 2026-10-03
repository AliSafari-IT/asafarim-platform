# ASafariM Admin

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
- **Devices** (`/devices`) — read-only list of machines on the ASafariM
  tailnet, fetched from the Tailscale API. See
  [Tailscale (Devices page)](#tailscale-devices-page).
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

### Tailscale (Devices page)

The Devices page calls `GET /api/v2/tailnet/{tailnet}/devices` and sends
`TAILSCALE_API_KEY` as a `Bearer` token
(`lib/server/tailscale.ts`). It needs:

| Variable | Value |
|---|---|
| `TAILSCALE_API_KEY` | An **API access token** (`tskey-api-...`) |
| `TAILSCALE_TAILNET` | Your tailnet ID or name, or `-` for the key's own tailnet |
| `TAILSCALE_WEBHOOK_SECRET` | Webhook signing secret (`tskey-webhook-...`), used by `/api/webhooks/tailscale` |

Tailscale has several key types, and only one of them works here:

| Prefix | What it is | Works? |
|---|---|---|
| `tskey-api-` | API access token | ✅ |
| `tskey-auth-` | Auth key, for joining a machine to the tailnet | ❌ 401 `API token invalid` |
| `tskey-client-` | OAuth client secret | ❌ must first be exchanged for an access token, which the code does not do yet |

Generate the token at
<https://login.tailscale.com/admin/settings/keys> → **API access
tokens**. API access tokens expire after at most **90 days**. When the
page shows *Could not reach Tailscale — 401*, the token is expired,
revoked, or the wrong key type: generate a new one and redeploy.

In production the value lives in the encrypted `.env.production.age`.
Update it by decrypting, editing, re-encrypting and committing — editing
`.env.production` on the VPS is overwritten on the next decrypt. See
[docs/environment-management.md](../../docs/environment-management.md).

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

Admin is deployed as part of the ASafariM Platform using Docker Compose and Caddy:

- **App container** — built from `apps/admin/Dockerfile` (Next.js standalone), proxied by Caddy at `https://admin.asafarim.com`
- **Database** — shared PostgreSQL via `@asafarim/db`
- **Auth** — shared session via `@asafarim/auth` (sign-in on Hub)
- **Access control** — admin/superadmin role gate

Production deployment is managed from the repo root:

```bash
pnpm deploy:prod
```

See [docs/deployment.md](../../docs/deployment.md) for VPS setup details and the full deployment pipeline.
