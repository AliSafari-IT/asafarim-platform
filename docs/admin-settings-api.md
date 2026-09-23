# Admin settings API — cross-app reads and the secret trust boundary

Platform settings are edited in the Admin console (`/settings`) and stored in
the platform database's `PlatformSetting` table. How an app **reads** them
depends on which database it runs on.

| App | Database | How it reads settings |
| --- | --- | --- |
| web, hub, showcase, admin, vionto, edumatch, timelineai | Platform (Prisma) | In-process: `getSetting` / `getBooleanSetting` / `getNumberSetting` from `@asafarim/db` |
| resumatch, testora, appbuilder, tasks-ai | Own isolated Postgres | Over HTTP: `@asafarim/settings-client` → Admin's `GET /api/internal/settings` |

Writes only ever happen through Admin's UI (`app/(admin)/settings/actions.ts`),
which enforces RBAC (`settings.edit` / `settings.secrets.edit`) and writes the
audit log. No app can change a setting through either read path.

## The internal settings API

`GET /api/internal/settings?scope=<app>` on Admin.

- **Authentication:** `Authorization: Bearer $INTERNAL_API_SECRET`, compared
  in constant time. A missing, wrong, or unconfigured secret gets **404**, not
  401, the same machine-endpoint pattern as the apps' `/api/internal/*`
  routes. Admin's auth proxy lets `/api/internal/*` through without a session;
  each route authenticates itself.
- **Response:** the requested app's settings plus platform-wide ones, each
  with `overridden` (whether an admin set it). `Cache-Control: no-store`.
- **Scope is not an access boundary.** Every caller shares one
  `INTERNAL_API_SECRET`, so the API can't tell which app is asking. `scope`
  only trims the payload. Treat every non-secret setting as readable by any
  app holding the secret.

## Client semantics: "trust the env var until an admin overrides it"

```ts
const client = createSettingsClient({
  baseUrl: process.env.NEXT_PUBLIC_ADMIN_URL,
  secret: process.env.INTERNAL_API_SECRET,
  scope: "resumatch",
});
const budget = await client.getSetting("resumatch.aiMonthlyBudgetUsd", getEnv().aiMonthlyBudgetUsd);
```

- Returns the admin's value **only when it has been overridden**. Otherwise it
  returns the caller's fallback (its existing env var or default), never the
  console's catalog default. Adopting the client changes nothing until an
  admin acts.
- One request per scope serves every key; the snapshot is reused for 60s, so
  an admin change takes up to a minute to reach the app.
- Never throws. API down, timeout, 404 from a bad secret, or a value whose type
  doesn't match the fallback: all resolve to the last good value, then to the
  fallback. After a failure it backs off for a full TTL instead of retrying on
  every call.

First consumer: ResuMatch's AI monthly budget (`lib/tailoring/ai/quota.ts`).
`RESUMATCH_AI_MONTHLY_BUDGET_USD` still applies until an admin sets
`resumatch.aiMonthlyBudgetUsd`.

## Secret trust boundary (v1 decision)

**Secret-typed settings are never readable over HTTP.** The API returns them
as `{ isSet }` with no `value` field. The serializer builds that object from
scratch rather than copying the setting, so a decrypted value can't leak in by
accident. There is no "secret-scoped" credential yet.

So for v1:

- **Isolated-DB apps (resumatch, testora, appbuilder, tasks-ai) keep reading
  secrets (API keys, SMTP passwords, Stripe keys) from env vars.**
- **Settings-store secrets are in-process only**: readable by apps on the
  platform database through `@asafarim/db`, which decrypts with
  `SETTINGS_ENCRYPTION_KEY`.

Why: `INTERNAL_API_SECRET` is shared by every app, so any app holding it
could read every secret. Handing out plaintext credentials needs a narrower
trust boundary: per-app credentials scoped to specific keys, plus an audit
record of each secret read. Build that before any isolated app needs a
console-managed secret, not before.
