# M12 — Launch Hardening, Observability, Backups, Quotas, and Custom-Domain Readiness

M12 is the last AppBuilder MVP milestone (#29): it makes the platform *safe
to operate*, not feature-richer. Nothing here changes what a generated app
can do — it changes what happens when something goes wrong, how much a
single account can cost the platform, whether the platform's own data can
be recovered, and how visible all of that is to the people running it.

This document is the entry point; the companion docs cover each area in
depth:

- [`appbuilder-m12-quota-policy.md`](./appbuilder-m12-quota-policy.md) — quota metrics, defaults, override procedure.
- [`appbuilder-m12-observability-runbook.md`](./appbuilder-m12-observability-runbook.md) — dashboards, alerts, triage, correlation-ID investigation, SLO/SLA assumptions.
- [`appbuilder-m12-backup-restore-runbook.md`](./appbuilder-m12-backup-restore-runbook.md) — backup cadence/retention/encryption, restore rehearsal procedure, recovery objectives.
- [`appbuilder-m12-privacy-retention.md`](./appbuilder-m12-privacy-retention.md) — what is retained, for how long, who can access it.
- [`appbuilder-m12-threat-model.md`](./appbuilder-m12-threat-model.md) — threat coverage, automated checks, current findings.
- [`appbuilder-m12-custom-domain-readiness.md`](./appbuilder-m12-custom-domain-readiness.md) — the inert, feature-flagged custom-domain data model and flow.
- [`appbuilder-m12-launch-checklist.md`](./appbuilder-m12-launch-checklist.md) — launch checklist, incident response, post-MVP backlog.

## The launch-readiness frontend

The single most visible M12 deliverable: `/apps/{appId}/operations`
(`app/apps/[appId]/operations/`), reachable via a **"Launch readiness"**
button in the workspace top bar — a first-class top-level page, not another
tab buried in the workspace's right panel (feedback from M11's review: the
deployment UI landed as one easy-to-miss tab; this milestone's UI work is a
first-class deliverable, not an afterthought).

It is backed by exactly one aggregation function,
`buildAppReadinessSnapshot` (`lib/observability/readiness.ts`), exposed via
`GET /api/apps/{appId}/operations`. Every field is read from a persisted
row at request time — nothing is cached, nothing is optimistic. The
`ReadinessStatus` type (`lib/observability/status.ts`) is `"healthy" |
"degraded" | "unhealthy" | "unknown" | "not_configured"` — the latter two
are first-class values a section actively reports, not values a section
falls back to by omission. A brand-new app's validation/deployment status
is `"unknown"`, not `"healthy"`; a platform with no backup ever run reports
`"not_configured"`, not silence.

Access: `app.viewOperations` is a `viewer`-minimum capability (see
`lib/repositories/authz.ts`), but the snapshot itself trims fields
server-side for a `viewer` role — `restricted: true` and every
cost/quota/backup/security/job-internals section is `null` in the JSON
response, not merely hidden by the client. An unrelated actor gets the same
`NotFoundError` → 404 every other app-scoped route returns.

## Quotas and cost control

See `appbuilder-m12-quota-policy.md` for the full metric list and defaults.
The core mechanism is `withQuota` (`lib/quotas/enforce.ts`): a Postgres
transaction-scoped advisory lock (`pg_advisory_xact_lock`) taken *before*
re-counting current usage and performing the guarded insert, all inside the
same transaction. This is what makes it race-safe — a bare
`SELECT count(*)` immediately followed by an `INSERT` is not: two
concurrent requests (including two retries of the exact same logical
request) can both observe "under the limit" and both proceed. The lock
serializes them; whichever commits first is what the second one's recount
actually sees.

Retries never double-consume quota: every quota-guarded write already sits
behind its own domain idempotency check (a unique `(appId, idempotencyKey)`
index, checked *before* `withQuota` is ever reached) — a genuine retry
short-circuits to the original row and never re-enters the quota check at
all. This is proven directly, under real concurrent load against real
Postgres, in `lib/quotas/quotas.integration.test.ts`.

Nine metrics are enforced (`lib/quotas/limits.ts`): `apps_per_owner`,
`active_generation_jobs_per_app`, `ai_requests_per_day_per_owner`,
`specification_versions_per_app`, `preview_builds_per_app`,
`storage_bytes_per_app`, `workflow_executions_per_day_per_app`,
`concurrent_deployment_jobs_per_app`, `concurrent_validation_jobs_per_app`.
Two are enforced *softly* by necessity rather than by choice —
`workflow_executions_per_day_per_app` is checked inside
`lib/generated-data/workflows.ts#triggerWorkflows`, which runs synchronously
inside the record-mutation transaction that triggered it and, by an
existing M09 contract, must never throw (a workflow problem must never roll
back the record write that triggered it) — so once the cap is hit, further
workflow triggers for that day are silently skipped and a
`quota.workflow_executions.rejected` operational event is recorded instead
of a thrown error. `storage_bytes_per_app` cannot hold the advisory lock
across the external object-storage write (`putObjectBytes`) without
serializing every concurrent upload for an app behind a potentially slow
network call, so its check-then-commit-then-external-write sequence is
bounded-race rather than fully race-safe — documented explicitly at the
call site in `lib/generated-data/files.ts#commitUpload`.

Every quota rejection is durably recorded via
`withQuotaRejectionLogging` (`lib/observability/events.ts`) on the OUTER
`db` handle, specifically because the transaction that hit the quota is
about to roll back — an event recorded on that same transaction would
vanish with it. Proven in `lib/observability/events.integration.test.ts`.

Overrides are a platform-superadmin mechanism, not app-owner self-service
(`lib/quotas/overrides.ts#setQuotaOverride`) — every grant/revoke is
recorded both in `quota_overrides` (with `reason`, `createdByPrincipalId`,
optional `expiresAt`) and mirrored to `operational_events`. Usage is also
recorded to an independent, append-only `usage_events` ledger
(`lib/quotas/recordUsage.ts`) specifically so a future billing system can
aggregate real historical usage without any schema change — billing itself
is explicitly out of scope for M12.

## Observability

`operational_events` (`lib/db/schema.ts`) is the durable event stream for
everything that doesn't already have a queryable home in an existing
table — quota rejections, backup/restore lifecycle, retention sweeps.
Queue depth, active/stuck-job counts, job duration, and validation/
deployment pass-fail rates are all derived directly from the existing
`generation_jobs`/`validation_runs`/`deployments` tables (see
`lib/observability/readiness.ts`'s "stuck" query: `status NOT IN (terminal)
AND lease_expires_at < now()` — a lease that expired without the owning
worker completing or heartbeating it) rather than duplicated into a
separate metrics table. See `appbuilder-m12-observability-runbook.md` for
the full signal list, dashboard queries, and alert thresholds.

## Backups and recovery

`lib/backup/runBackup.ts` (`pnpm --filter appbuilder backup:run`) runs a
real `pg_dump --format=custom` against `APPBUILDER_DATABASE_URL`, uploads
the artifact through `@asafarim/storage`, and records a `backup_runs` row
with a sha256 checksum and byte size.
`lib/backup/runRestoreRehearsal.ts` (`pnpm --filter appbuilder
backup:restore-rehearsal`) restores the latest backup into a **separate,
non-production** database — `lib/backup/safety.ts#assertNotProduction`
refuses to run unless the target is provably distinct from
`APPBUILDER_DATABASE_URL` by three independent checks (different
connection string, different database name, and a database name that
*looks* like a scratch target) — and verifies row counts across eleven
tables spanning app metadata, specifications, releases, generated data, and
audit records. Both were run for real against this repository's dev
database as part of implementing this milestone; see
`appbuilder-m12-backup-restore-runbook.md` for the recorded evidence and
the full recovery runbook.

## Security

See `appbuilder-m12-threat-model.md` for the full per-category writeup.
Headline: IDOR/cross-owner/cross-app leakage was already the platform's
central invariant before M12 (`assertCapability`'s indistinguishable
404-for-unrelated/403-for-under-ranked contract, exercised for every new
M12 capability the same way); M12 adds quota-bypass and denial-of-wallet
coverage (the quota race-safety tests above), custom-host collision
prevention (a partial unique index on `custom_domain_requests.requested_host`
excluding cancelled rows), and a documented, unresolved **critical**
finding in a shared platform dependency (`next-auth@5.0.0-beta.28`) that is
explicitly **not** fixed in this PR — see that doc for why.

## Privacy and retention

See `appbuilder-m12-privacy-retention.md`. One category
(`validation_artifacts` — screenshots/traces) has real automated deletion
(`lib/retention/sweep.ts`, dry-run by default via `pnpm --filter appbuilder
retention:sweep`); the rest have computed, tested eligibility
(`lib/retention/eligibility.ts`) but operator-assisted deletion for M12 —
an explicit scope decision, not an oversight, documented in that file's own
docstring.

## Custom-domain readiness

See `appbuilder-m12-custom-domain-readiness.md`. `APPBUILDER_CUSTOM_DOMAINS_ENABLED`
is unset in every environment this milestone ships to. The data model
(`custom_domain_requests`) and a request/cancel flow
(`lib/customDomains/requests.ts`) exist and are exercised by real tests,
but nothing in this codebase provisions DNS, issues a TLS certificate, or
routes traffic for a row in that table.

## Explicit M12 deferrals

- **Enforcement beyond the nine listed quota metrics** at every single
  resource-creation call site (e.g. `specification_versions_per_app` is
  enforced at the highest-traffic path, `applyOperation`, but not yet at
  the two lower-traffic ones, `restoreVersion` and `applyTemplateVersion`)
  — the shared `withQuota` primitive makes extending this a small, well-
  understood change, tracked as follow-up.
- **Automated retention deletion** for prompts/conversations/AI
  diagnostics/generated data on archived apps — eligibility is computed and
  tested; deletion remains operator-assisted (see privacy-retention doc).
- **The critical `next-auth` dependency finding** — a shared, platform-wide
  package (Hub, Admin, AppBuilder all depend on the same pinned beta), not
  an AppBuilder-only fix; see the threat-model doc.
- **Custom domains, DNS automation, billing, code export, arbitrary
  integrations, and new product families** — all explicitly out of scope
  per issue #41, unchanged by this milestone.
