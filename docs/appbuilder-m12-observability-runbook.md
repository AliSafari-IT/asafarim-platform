# M12 Observability Runbook

## Signals and where they live

| Signal | Source | How to query |
|---|---|---|
| Queue depth (generation/validation/deployment) | `generation_jobs` / `validation_runs` / `deployments` | `SELECT status, count(*) FROM generation_jobs GROUP BY status` (same shape for the other two tables) |
| Active jobs | Same tables | `status NOT IN (<terminal set for that table>)` — see `lib/quotas/usage.ts`'s `TERMINAL_*_STATUSES` constants for the exact terminal-status list per subsystem |
| Stuck jobs | Same tables | `status NOT IN (<terminal>) AND lease_expires_at < now()` — a lease that expired without the owning worker completing OR heartbeating it. Computed live for a single app in `lib/observability/readiness.ts`; for a platform-wide view, drop the `app_id =` filter. |
| Job duration | `generation_jobs`/`validation_runs`/`deployments`.`startedAt`/`completedAt` | `SELECT avg(completed_at - started_at) FROM deployments WHERE status = 'succeeded'` |
| Provider latency/usage | `generation_jobs.usage` (jsonb, `@asafarim/appbuilder-ai`'s `UsageMetadata` shape) | `SELECT usage FROM generation_jobs WHERE status = 'ready' ORDER BY created_at DESC LIMIT 50` |
| Validation pass/fail rate | `validation_runs.status` | `SELECT status, count(*) FROM validation_runs GROUP BY status` |
| Deployment success/failure/rollback rate | `deployments.status`, `.is_rollback` | `SELECT status, is_rollback, count(*) FROM deployments GROUP BY 1, 2` |
| Runtime API failures | *Not yet instrumented* — see "Known gaps" below | — |
| Storage usage | `generated_files` (committed, per app) | `lib/quotas/usage.ts#sumStorageBytesForApp`; platform-wide: `SELECT sum(size_bytes) FROM generated_files WHERE status = 'committed'` |
| Workflow retries/failures | `generated_workflow_executions.status` | `SELECT status, count(*) FROM generated_workflow_executions GROUP BY status` |
| Quota rejections | `operational_events` where `category = 'quota'` | `SELECT kind, count(*) FROM operational_events WHERE category = 'quota' AND created_at > now() - interval '1 day' GROUP BY kind` |
| Backup freshness | `backup_runs` | `lib/backup/repository.ts#getLatestBackupStatus`; platform-wide: latest row per `kind` |
| Restore verification status | `restore_rehearsals` | `lib/backup/repository.ts#getLatestRestoreRehearsal` |

Every one of these is a live query against the actual operational tables —
there is no separate metrics-aggregation pipeline to fall out of sync with
reality. The per-app readiness snapshot (`/apps/{appId}/operations`)
surfaces the app-scoped subset of this table live; a platform-wide
dashboard (Grafana/Metabase/whatever the operator prefers) can point
directly at `APPBUILDER_DATABASE_URL` (read replica in production) and run
the same queries without any app-side change.

## Correlation IDs

`operational_events.correlation_id` (nullable) is the join key for
"everything that happened as part of one logical request" across
generation/modification/repair/validation/preview/deployment/rollback/
runtime/storage/workflow.

**M13 slice G made this real for the conversational path.** Every M13 API
route accepts and returns an `x-correlation-id` header, mints one when the
caller supplies none, and persists it on `modification_jobs`,
`conversation_attachments`, and every operational event those paths emit — so
one conversational change reads as one thread across its HTTP request, job,
provider calls, plan steps, and attachment work. Investigate with:

```sql
SELECT created_at, category, kind, severity, detail FROM operational_events WHERE correlation_id = '<id>' ORDER BY created_at;
```

Start from the job when the user has no id to quote:

```sql
SELECT id, status, correlation_id FROM modification_jobs WHERE app_id = '<appId>' ORDER BY created_at DESC LIMIT 5;
```

A malformed inbound header is discarded and replaced with a fresh id rather
than sanitized — the value reaches a persisted column and a response header,
so accepting caller text would make it a log-injection vector. Jobs created
before slice G have `correlation_id IS NULL`; their events carry a synthetic
`job-<jobId>` instead (see `lib/observability/correlation.ts`).

### M13 event kinds

`lib/observability/events.ts#M13_EVENT_KINDS` is the closed list. Grouped:
`attachment.*` (initiated, committed, extraction_completed/skipped,
quarantined, scan_not_configured, deleted, swept_unclaimed, rejected),
`context.*` (assembled, truncated, vision_unavailable), `resolver.*`
(resolved, ambiguous, unresolved), `clarification.*` (asked, answered,
exhausted), `plan.*` (created, step_applied, completed, stopped,
suppressed_by_flag), `reference.*` (imported, blocked, fetch_failed,
rate_limited, disabled_by_flag), `model.*` (call_completed, call_failed),
`retention.*` (swept, sweep_failed), `shadow.*` (evaluated, failed).

No event kind carries prompt text, conversation content, extracted attachment
text, imported reference bodies, resolved IP addresses, or URL paths. A
`detail` payload holds counts, codes, durations, hosts, and stable ids only.

### M13 metrics and readiness

`GET /api/apps/{appId}/operations` now returns `m13` (storage, extraction,
malware scanning, model vision, URL import, cleanup lag, evaluation version,
and resolved feature-flag states) and `m13Metrics` (attachment, context,
resolver, clarification, plan, decision, reference, token, storage, and
estimated-cost figures). Both are owner/editor only; a viewer gets `null` for
each, but any `unhealthy` M13 section still reaches `launchBlockingIssues`,
which is populated for every role.

Cost is an **estimate** from a checked-in rate table
(`lib/observability/costRates.ts`), never billing. A model with no configured
rate contributes zero and is named in `cost.unratedModels` — check that field
before trusting a total.

See `docs/appbuilder-m13-hardening-rollout.md` for the full section-by-section
table of what each readiness status means and which are launch-blocking.

Deployment steps (`deployment_steps`, one row per phase per deployment
attempt) are the equivalent trace for a single deployment even without a
correlation ID — `deploymentId` is the join key:

```sql
SELECT phase, ok, message, duration_ms FROM deployment_steps WHERE deployment_id = '<id>' ORDER BY created_at;
```

## Alert thresholds (recommended)

These are starting points, not tuned production values — set them in
whatever alerting system queries the database (no in-app alerting exists in
M12):

- **Stuck jobs**: any row matching the "stuck" query above, alert immediately (a stuck job means a worker crashed without releasing its lease past the expected `STALE_LEASE_SWEEP_INTERVAL_MS`/`DEFAULT_LEASE_DURATION_MS` window — see `lib/deployment/limits.ts`/`lib/generation/limits.ts`).
- **Failed deploys**: `deployments.status = 'failed'` in the last hour > 0 for any single app, or > 3 platform-wide in an hour.
- **Migration failures**: any non-zero exit from `pnpm --filter appbuilder db:migrate` in CI/CD — treat as a release-blocking failure, not a warning.
- **Database pressure**: standard Postgres signals (connection count near `max_connections`, replication lag if applicable) — not AppBuilder-specific, use the hosting provider's existing Postgres monitoring.
- **Unusual AI spend**: `ai_requests_per_day_per_owner` quota exhaustion events (`operational_events` kind `quota.rejected` with `detail->>'metric' = 'ai_requests_per_day_per_owner'`) — more than a handful per day across the whole platform warrants a look; a single owner hitting it repeatedly warrants a conversation, not necessarily an override.
- **Backup staleness**: `getLatestBackupStatus` reporting `"degraded"` or `"not_configured"` — page whoever owns backup scheduling immediately; `"unhealthy"` (last backup failed) is a same-day incident.
- **Quota rejections spiking**: a sudden rise in any `quota.rejected` kind for one app/owner is either a legitimate growth signal (consider an override) or a runaway client (investigate before overriding).

## Triage checklist

1. Identify the affected app/owner (from the readiness dashboard or a direct query).
2. Pull recent `operational_events` for that `app_id`, most severe first.
3. For a stuck job: check `lease_owner`/`heartbeat_at` — did the worker process crash? Check `worker.ts`'s own health endpoint (`APPBUILDER_WORKER_HEALTH_PORT`, default 3008) and process logs.
4. For a failed deployment: read `deployment_steps` for that `deploymentId` — `ok=false` rows carry a redacted `message`/`detail` (never raw secrets — see `lib/validation/redaction.ts`).
5. For a quota rejection: confirm it's not a bug (unexpected concurrent duplicate requests) before considering an override — see `appbuilder-m12-quota-policy.md`.
6. For anything involving generated-app data: confirm environment scoping (`preview` vs `production`) before concluding data is missing — `lib/generated-data/environment.ts` is the single source of truth for which environment a request resolved to.

## SLO/SLA assumptions (MVP-stage — not contractual)

- **Availability**: no formal SLA at MVP stage; target best-effort >99% for the builder UI and managed-app production hosts during business hours.
- **Deployment**: a forward deployment (already-approved release) is expected to complete end-to-end (queued → activated → verified) within 2 minutes under normal load — see `DEPLOYMENT_LIMITS.HEALTH_CHECK_TIMEOUT_MS`/`EXTERNAL_VERIFY_TIMEOUT_MS` (`lib/deployment/limits.ts`) for the hard per-phase timeouts that bound this.
- **Backup RPO (Recovery Point Objective)**: target ≤24 hours of data loss — i.e. a daily backup cadence (see `appbuilder-m12-backup-restore-runbook.md`). No automated hourly/continuous backup exists in M12.
- **Backup RTO (Recovery Time Objective)**: target ≤2 hours to restore the database from the latest backup into a working state, based on the actual rehearsal timings recorded in `restore_rehearsals` (a real rehearsal in this repository's dev environment completed in well under a minute against a small dataset — production RTO will scale with database size and is not yet measured at production scale).
- **Quota enforcement latency**: negligible — `withQuota`'s advisory lock adds microseconds to a normal (non-contended) write; only genuinely concurrent requests against the same scope+metric ever wait, and only for the duration of the winning transaction.

## Known gaps (explicit, not hidden)

- **Runtime API failures** (errors from a generated app's own `/api/apps/{appId}/runtime/*` routes serving end-users) are not yet aggregated into `operational_events` — they're currently only visible via server logs / the hosting platform's own request logging. Tracked as a follow-up.
- **Correlation IDs** are threaded end-to-end through the M13 conversational path (attachments, references, modification jobs, plans, clarification, provider calls, shadow runs) as of slice G, and through quota rejections since M12. The **generation (M07), validation (M10), and deployment (M11)** paths still do not stamp one — the mechanism is identical and populating them is a small change, but it has not been done, so an M07 generation job's events cannot yet be joined the way an M13 modification job's can.
- **Vision readiness reports `unhealthy` if `APPBUILDER_VISION_ENABLED=true`**, deliberately: no provider path sends image parts yet, so enabling the flag would claim a capability that does not exist. This is a real gap in the feature, not a bug in the check.
- **No in-app alerting** — every threshold above must be wired into an external system (cron + query + notification, or a BI/observability tool pointed at the database) by an operator; M12 provides the queryable data, not the alerting pipeline itself.
