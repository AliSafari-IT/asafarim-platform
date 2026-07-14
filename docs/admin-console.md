# Admin Console — access model, audit, and settings

How authorization, the application registry, audit logging, and platform
settings work across `apps/admin` and `apps/hub`. Covers issues #24/#25.

## Application registry

`packages/auth/src/apps.ts` is the single source of truth for which apps
exist and who may open them. Each entry:

```ts
interface PlatformApp {
  key: string;          // stable key; active keys match PlatformLinks keys
  name: string;         // display name
  description: string;
  glyph: string;        // launcher tile glyph, e.g. "AD"
  meta: string;         // technical meta line, e.g. "admin.asafarim.com"
  status: "active" | "coming-soon";
  access: "public" | "authenticated" | string[] | null;
}
```

URL resolution stays in `@asafarim/ui`'s `getPlatformLinks()` — active app
keys (`web`, `hub`, `showcase`, `admin`) deliberately match `PlatformLinks`
keys, so callers resolve `links[app.key]`. URLs are environment-aware via
`NEXT_PUBLIC_*_URL` with localhost defaults.

### Effective-access evaluation

`getAppAccessDecision(app, { roles, authenticated })` evaluates server-side
and returns `{ allowed, reason }` with a deterministic reason:

| Reason | Allowed | Meaning |
|---|---|---|
| `public` | yes | app is open to everyone |
| `authenticated` | yes | any signed-in active user |
| `role` | yes | one of the user's roles is in the app's access list |
| `superadmin` | yes | explicit superadmin bypass |
| `coming-soon` | no | registered but not built; nobody enters, superadmin included |
| `no-access-defined` | no | `access: null` |
| `not-authenticated` | no | app needs a session and there is none |
| `missing-role` | no | signed in but no qualifying role |

`authenticated` must reflect *usable* sessions: deactivated users cannot
sign in (enforced in `packages/auth/src/config.ts` signIn callback and
`requireUser`), so pass `authenticated: user.isActive` when deriving access
for another account (as the Admin users pages do).

A user may hold access to **any number of apps** — access is the union of
what their roles allow, never one app per role.

Tests: `packages/auth/src/apps.test.ts` (`pnpm --filter @asafarim/auth test`).

### Adding a new platform app safely

1. Add the registry entry with `status: "coming-soon"`, `access: null` in
   `packages/auth/src/apps.ts` (tile appears disabled in Hub, admin pages
   show it as "soon").
2. When the app ships: add its URL to `PlatformLinks`
   (`packages/ui/src/links.ts`) using the same key, set
   `status: "active"`, and define `access`.
3. Enforce access inside the app itself with `requireUser`/`requireRole` —
   launcher visibility is never the security boundary.
4. If the app introduces permissions, add them to
   `packages/db/prisma/seed.ts` and re-run `pnpm --filter @asafarim/db db:seed`.

## Roles and permissions

- **System roles** (`superadmin`, `admin`, `standard_user`, `guest`) are
  seeded with `isSystem: true`. Their machine names are code constants
  (`ROLES` in `packages/auth/src/roles.ts`): they cannot be renamed or
  deleted from the UI. Display name/description remain editable.
- **Custom roles** can be created, edited, granted permissions, and deleted
  on `/roles` (requires `roles.edit`).
- **Permission keys** follow `domain.action` (`users.edit`, `roles.assign`).
  The catalog is **seed-managed**: keys are referenced in code, so the UI
  never creates or deletes permissions — new ones arrive with the features
  that enforce them, via the seed.
- A user holds a permission when **any** of their roles grants it
  (`hasPermission` in `packages/auth/src/permissions.ts`).

### Superadmin behavior

The bypass is explicit in three places, by design:

- `hasRole` returns true for any role check.
- `hasPermission` short-circuits without a DB query.
- `getAppAccessDecision` reports `reason: "superadmin"`.

Consequences: the superadmin role's stored grants are cosmetic, so the role
detail page refuses to edit them; only a superadmin can grant or revoke the
superadmin role; and the platform always keeps **one active superadmin** —
the last one can be neither deactivated nor stripped of the role
(enforced in `apps/admin/app/(admin)/users/actions.ts`).

### Self-lockout protection

Admins deactivating their own account or removing their own final
admin/superadmin role must pass an explicit confirmation
(`confirmSelf: true`), which the UI only sends after a hard confirm dialog.

## Server-side authorization boundaries

Every page *and* every server action re-checks the session and the specific
permission — UI hiding and the layout's role gate are never trusted:

| Surface | Read | Mutate |
|---|---|---|
| `/users` | `users.list` | `users.edit`, `users.deactivate`, `roles.assign` |
| `/roles` | `roles.list`, `roles.view` | `roles.edit` |
| `/permissions` | `roles.list` (catalog is part of the roles domain) | — (seed-managed) |
| `/audit-logs` | `audit.view` | — (immutable) |
| `/settings` | `settings.view` | `settings.edit` |

## Audit events

Written via `writeAuditEvent` (`apps/admin/lib/audit.ts`) with the acting
user, entity (`User`, `UserRole`, `Role`, `PlatformSetting`, `Admin`),
entity id, structured before/after `changes`, and best-effort client IP.
Audit writes are non-fatal: a failed write never rolls back the mutation.

Taxonomy:

| Action | Entity |
|---|---|
| `user.activated` / `user.deactivated` / `user.updated` | `User` |
| `role.assigned` / `role.removed` | `UserRole` |
| `role.created` / `role.updated` / `role.permissions.updated` / `role.deleted` | `Role` |
| `settings.updated` / `settings.reset` | `PlatformSetting` |
| `admin.access_denied` | `Admin` |

### Redaction

`redactSensitive` runs on **write**, replacing values of any key matching
`password|token|secret|code|session|hash|otp|api[-_]key|credential`
(case-insensitive, deep) with `"[redacted]"`. Never put raw secret material
in `changes` anyway — redaction is the safety net, not the design.

The `/audit-logs` UI is read-only for all administrators; there is no edit,
delete, or export surface.

## Platform settings

`PlatformSetting` (key-unique JSON rows) stores **only** keys declared in
the typed catalog `apps/admin/lib/settings.ts` — unknown keys are rejected
server-side. Each definition carries type, default, validation bounds,
grouping, and a `highImpact` flag that forces a confirmation dialog.

Current catalog: `platform.tagline`, `platform.announcement`,
`maintenance.enabled`, `maintenance.message`, `registration.open`.

- Database rows are overrides; deleting one (the "reset to default" action)
  falls back to the coded default. Both paths are audited with
  before/after values.
- Environment configuration (app URLs, `NODE_ENV`, credentials) is shown
  read-only and never editable from the UI.
- Secrets are never displayed or persisted through this page, and no
  setting can alter roles, permissions, or access rules.

## Local verification accounts

Never commit credentials. Seed a superadmin locally via env vars:

```bash
SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_PASSWORD=<local-only> \
  pnpm --filter @asafarim/db db:seed
```

Then exercise the role spectrum by creating throwaway accounts through Hub
sign-up (they land as `guest`) and adjusting them at
`localhost:3003/users`: standard user, limited admin (custom role with a
permission subset), roleless user (remove all roles), inactive user
(deactivate), and a multi-app user (e.g. `standard_user` + `admin`).
