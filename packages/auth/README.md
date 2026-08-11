# @asafarim/auth

Shared Auth.js v5 authentication for the entire ASafarIM Platform. One
session, one cookie, every app — there is no per-app login.

## What's here

- **Auth.js config** (`auth.ts`, `config.ts`) — JWT strategy, shared
  `.asafarim.com` cookie in production (`localhost` domain in dev),
  credentials + email-code providers, trusted-origin redirect
  callback.
- **Route proxy** (`proxy.ts`) — `createAuthProxy()` /
  `authProxy` for Next.js 16 `proxy.ts`. Protects routes, redirects
  unauthenticated HTML to Hub's `/sign-in` with an absolute callback
  URL, returns `401` JSON for API calls, blocks deactivated users,
  and enforces per-route role gates. Superadmin always passes.
- **Platform app registry** (`apps.ts`) — `PLATFORM_APPS` is the
  single source of truth for which apps exist, their access policy
  (`public`, `authenticated`, role-gated, or `null` for deferred),
  and their showcase metadata. `getAccessibleApps()`,
  `getAppSwitcherApps()`, and `canAccessApp()` derive what a signed-in
  user sees in launchers and switchers.
- **Roles** (`roles.ts`) — `ROLES` (`superadmin`, `admin`,
  `standard_user`, `guest`), `hasRole()`, `isAdmin()`.
- **Permissions** (`permissions.ts`) — `hasPermission()`,
  `getUserPermissions()`.
- **Modules** (`modules.ts`) — navigation module visibility system
  (`NAV_MODULES`, `filterModulesByVisibility()`,
  `getModuleOverrides()`).
- **Session helpers** (`session.ts`) — `getSession()`,
  `requireUser()`, `requireRole()`.
- **Registration** (`register.ts`) — `registerUser()` with Zod-validated
  input and `generateUniqueUsername()` / `slugifyUsername()`.
- **Email login** (`email-code.ts`) — `requestEmailLoginCode()` for
  passwordless code-based login.
- **Profile** (`profile.ts`) — `updateUserProfile()`,
  `changePassword()`.
- **Locations** (`locations.ts`) — CRUD for user-saved locations.
- **Mailer** (`mailer.ts`) — `createTransport()`, `getSmtpConfig()`.

## Exports

```ts
import { auth, handlers, signIn, signOut, ROLES, hasRole, requireRole } from "@asafarim/auth";
import { createAuthProxy } from "@asafarim/auth/proxy";
import { PLATFORM_APPS, getAccessibleApps } from "@asafarim/auth/apps";
import { ROLES } from "@asafarim/auth/roles";
```

## Scripts

```bash
pnpm --filter @asafarim/auth typecheck
pnpm --filter @asafarim/auth test          # vitest
```
