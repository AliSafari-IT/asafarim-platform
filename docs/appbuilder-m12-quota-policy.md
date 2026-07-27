# M12 Quota Policy

## Purpose

Bound the platform's worst-case exposure — AI provider spend, storage cost,
concurrent worker load — to a single account, without implementing billing
(explicit non-goal). See `lib/quotas/limits.ts` for the source of truth;
this document explains the *why* behind each default and the operational
procedure for changing one.

## Metrics and defaults

| Metric | Scope | Default | Enforcement | Rationale |
|---|---|---|---|---|
| `apps_per_owner` | owner | 20 | Hard, race-safe | Bounds per-account sprawl; raised via override for legitimate high-volume accounts (see below — this is exactly what happened for the e2e fixture owner during this milestone's own development). |
| `active_generation_jobs_per_app` | app | 1 | Hard, race-safe | One AI generation job per app at a time was already a pre-M12 invariant (`GENERATION_LIMITS.MAX_ACTIVE_JOBS_PER_APP`); M12 replaces its non-race-safe `SELECT count(*)` check with `withQuota`. |
| `ai_requests_per_day_per_owner` | owner | 200 | Hard, race-safe | The direct denial-of-wallet bound — every AI generation/modification/repair request increments this via `lib/quotas/recordUsage.ts`. |
| `specification_versions_per_app` | app | 500 | Hard, race-safe (primary path) | Bounds unbounded version growth from a scripted flood of tiny operations. |
| `preview_builds_per_app` | app | 300 | Hard, race-safe | Only NEW builds count — reusing an identical (version, registry) build is free. |
| `storage_bytes_per_app` | app | 500 MiB | Hard, bounded-race (see below) | Object-storage cost bound. |
| `workflow_executions_per_day_per_app` | app | 2000 | Soft (see below) | Bounds a workflow-chain runaway without ever rolling back the record write that triggered it. |
| `concurrent_deployment_jobs_per_app` | app | 1 | Hard, race-safe | New in M12 — no such check existed pre-M12. |
| `concurrent_validation_jobs_per_app` | app | 1 | Hard, race-safe | Replaces the pre-M12 non-race-safe `VALIDATION_LIMITS.MAX_ACTIVE_RUNS_PER_APP` check with `withQuota`, same rationale as generation jobs. |

**Hard, race-safe**: `withQuota` (`lib/quotas/enforce.ts`) takes a
`pg_advisory_xact_lock` scoped to `(metric, scope)` inside the same
transaction that counts current usage and performs the guarded write. Two
concurrent requests — including two retries of the exact same logical
request — serialize on the lock; the loser's recount sees the winner's
committed row and correctly refuses. Verified directly under real
concurrent load in `lib/quotas/quotas.integration.test.ts` (10 concurrent
`createApp` calls against a limit of 3 admit exactly 3, never more).

**Hard, bounded-race** (`storage_bytes_per_app` only): the lock cannot be
held across the external `putObjectBytes` call without serializing every
upload for an app behind a potentially slow network write, so the check
commits (releasing the lock) before the external write happens. This bounds
the race to the number of uploads genuinely in flight at once for one app —
acceptable for a storage cap, explicitly not claimed to be as strong as the
count-based quotas above.

**Soft** (`workflow_executions_per_day_per_app` only): checked via the
read-only `checkQuotaSnapshot` (no lock, no write) inside
`lib/generated-data/workflows.ts#triggerWorkflows`, which by an existing
M09 contract must never throw. Once the cap is reached, further workflow
triggers for the rest of that day are silently skipped and a
`quota.workflow_executions.rejected` operational event is recorded.

## Retries never bypass a quota

Every quota-guarded write sits behind its own domain idempotency check —
a unique `(appId, idempotencyKey)` index (or, for `apps_per_owner`, the
`(ownerPrincipalId, scope, key)` `idempotency_keys` table) — checked
*before* `withQuota` is ever reached. A genuine retry of an
already-completed request short-circuits to the original row and never
re-enters the quota check at all, so it can never be double-charged against
the limit. Proven directly in
`lib/quotas/quotas.integration.test.ts`'s "never blocks a genuine retry...
even once the quota is fully exhausted" test.

## User-facing limit states

`lib/http/errors.ts#errorResponse` maps `QuotaExceededError` to HTTP 429
with a structured body: `{ error, code: "quota_exceeded", metric, limit,
current }` — a client can render "You've used 20/20 apps" rather than a
generic failure. The readiness dashboard (`/apps/{appId}/operations`)
additionally surfaces every metric's current/limit as a standing display,
not only at the moment of rejection, and lists any exceeded quota under
"Launch-blocking issues".

## Admin override procedure

Quota overrides are a **platform-superadmin** action, not app-owner
self-service — an app owner nearing a limit is told (via the readiness UI)
to contact an operator. To grant one:

```ts
import { setQuotaOverride } from "@/lib/quotas/overrides";
await setQuotaOverride(db, superadminActor, {
  scopeType: "owner", // or "app"
  scopeId: ownerPrincipalId, // or appId
  metric: "apps_per_owner",
  limitValue: 100,
  reason: "legitimate high-volume account — ticket #123",
  expiresAt: undefined, // or a Date for a temporary exception
});
```

Every grant/revoke is recorded in `quota_overrides` (with `reason`,
`createdByPrincipalId`, `expiresAt`) and mirrored to `operational_events`
(category `"quota"`, kind `"quota.override.set"`/`"quota.override.revoked"`)
— visible in the same audit trail operators already use for everything
else. `resolveQuotaLimit` only ever considers the most recent
non-revoked, non-expired override; history accumulates rather than being
overwritten.

This mechanism was exercised for real during this milestone's own e2e test
suite: `tests/e2e/global-setup.ts` seeds well over a dozen fixture apps
under one demo owner (by design — one fixture per milestone's edge cases),
which immediately hit the real `apps_per_owner` default and had to be
granted a real override before seeding could proceed — a genuine, if
incidental, end-to-end exercise of the override path.

## Preserving usage data for future billing

Every AI request, preview build, validation run, deployment, and storage
write appends one row to `usage_events` (`lib/quotas/recordUsage.ts`) —
append-only, never mutated or swept, kept indefinitely by design. This
satisfies "preserve enough usage data for future billing" without
implementing billing itself.
