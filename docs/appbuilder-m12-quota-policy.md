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
| `attachment_bytes_per_app` | app | 200 MiB | Hard, bounded-race | M13 slice B. Deliberately separate from `storage_bytes_per_app`: conversation attachments are authoring *input*, not the app's own generated-data storage, and they are additionally subject to the 24h unclaimed-upload sweep. Sharing one budget would let a few screenshots crowd out an app's real data. |
| `attachments_per_app` | app | 500 | Hard, race-safe | Bounds row count independently of bytes — 500 tiny files cost little storage and a great deal of per-message context assembly. |
| `references_per_app` | app | 100 | Hard, race-safe | M13 slice F. How much third-party content one app accumulates. Rows are refreshed in place, so this counts distinct URLs, not fetches. |
| `reference_fetches_per_day_per_app` | app | 200 | Hard, race-safe | The one that matters for abuse: how many **outbound requests** the platform makes on a user's behalf per day. Without it, an app becomes a way to scan or hammer other people's servers from our IP address. Recorded in the same transaction as the check that permitted it, so "fetches today" is always re-derived from rows that only exist for requests that really happened. |

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

Every AI request, preview build, validation run, deployment, storage write,
and public-reference fetch appends one row to `usage_events`
(`lib/quotas/recordUsage.ts`) — append-only, never mutated or swept, kept
indefinitely by design. This satisfies "preserve enough usage data for future
billing" without implementing billing itself.

**M13 slice G adds an estimate on top, and it is not billing.**
`lib/observability/metrics.ts#estimateCost` turns the token counts recorded on
`modification_jobs.usage` into USD via a checked-in rate table
(`lib/observability/costRates.ts`), overridable per model through
`APPBUILDER_MODEL_COST_RATES` for operators on negotiated pricing.

Three deliberate limits on how far to trust it:

- The ledger records **usage**, not price. The price comes from a table that
  can be stale, so the result is labelled `estimated: true` on the field
  itself and every consumer must present it that way.
- A model with **no configured rate contributes zero and is named** in
  `cost.unratedModels`. Guessing a rate would be worse than a visible gap, and
  absorbing it into a total that looks complete would be worse still — check
  that field before quoting a number.
- Live pricing is deliberately **not** fetched: that would make a metrics read
  perform an outbound request to a vendor, adding both a failure mode and an
  egress surface to an operator dashboard.

## M13 limits enforced outside the quota ledger

Not every M13 bound is a quota row, and conflating the two would misrepresent
where enforcement happens. These are fixed per-request limits, checked at the
point of use rather than counted over a window:

| Limit | Value | Where |
|---|---|---|
| Attachments per message | 8 | `lib/attachments/limits.ts` |
| Image size / text size / PDF size | 10 MB / 2 MB / 20 MB | `lib/attachments/limits.ts` |
| Extracted text per file / per model call | 50,000 / 100,000 chars | `lib/attachments/limits.ts` |
| Plan steps per decision | `MAX_PLAN_STEPS` | `lib/modification/limits.ts` |
| Clarification rounds | 2 | `lib/modification/limits.ts` |
| Reference response bytes / timeout / redirects | 512 KB / 8 s / 3 hops | `lib/references/limits.ts` |
| Reference cache TTL | 6 hours | `lib/references/limits.ts` |

The server returns the attachment catalogue to the client so the composer
keeps no divergent copy of it.
