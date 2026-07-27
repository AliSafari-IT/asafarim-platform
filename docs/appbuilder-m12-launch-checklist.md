# M12 Launch Checklist, Incident Response, and Post-MVP Backlog

## Launch checklist

- [x] Quota enforcement is race-safe under real concurrent load (`lib/quotas/quotas.integration.test.ts`).
- [x] Quota enforcement cannot be bypassed by retries (same file, dedicated test).
- [x] A real database backup has been recorded (`backup_runs`, evidence in `appbuilder-m12-backup-restore-runbook.md`).
- [x] A restore has been rehearsed in a non-production database, with verified row counts (`restore_rehearsals`, same doc).
- [x] The launch-readiness dashboard shows only real, persisted status — no optimistic defaults (`lib/observability/readiness.integration.test.ts`; visually confirmed in `docs/screenshots/`).
- [x] Cross-app and cross-owner operational-data isolation is enforced and tested (`lib/observability/readiness.integration.test.ts`, e2e spec).
- [x] Custom domains remain disabled (`APPBUILDER_CUSTOM_DOMAINS_ENABLED` unset; verified in `lib/customDomains/requests.integration.test.ts`).
- [x] Security tests exist for IDOR, quota bypass, destructive-restore prevention, and custom-host collision (`appbuilder-m12-threat-model.md`'s "Automated security-relevant tests added in M12").
- [ ] **Unresolved**: the `next-auth@5.0.0-beta.28` critical dependency findings — see threat model doc and backlog below.
- [ ] Automated retention deletion beyond `validation_artifacts` — eligibility computed, deletion still operator-assisted (explicit scope decision, see privacy-retention doc).
- [ ] Production backup scheduling (cron/CI) — the script exists and has been run for real; wiring it into a recurring schedule is an infra/ops task outside this repository.
- [ ] Alerting wired into an external system — the queries and thresholds are documented (`appbuilder-m12-observability-runbook.md`); no in-app alerting exists.

## Incident response runbook

**Who**: whoever holds on-call for the AppBuilder platform (not
specified further — this document defines detection/response steps, not
a rotation).

### Detection signals (see observability runbook for exact queries)

- Stuck job (lease expired without completion) — check immediately.
- Failed deployment — check within the hour.
- Backup `"unhealthy"` or `"not_configured"` — same-day.
- Quota-rejection spike for one owner — investigate before considering an override.
- Migration failure in CI/CD — release-blocking, do not proceed.

### Response steps

1. **Confirm scope** — one app, one owner, or platform-wide? Query
   `operational_events`/the relevant domain table for the affected
   `app_id`/`owner_principal_id`.
2. **Contain** — for a stuck job, nothing more is needed (the sweep
   pattern already recovers it on the worker's next cycle); for a failed
   deployment, check whether the auto-restore-previous-pointer path
   already ran (`lib/deployment/pipeline.ts`'s `verifying` phase does this
   automatically on failure) before assuming production is actually down.
3. **Diagnose** — pull `deployment_steps`/`validation_gate_results`/
   `operational_events` for the affected row(s); every diagnostic string
   is already redacted (`lib/validation/redaction.ts`), safe to share in an
   incident channel.
4. **Remediate** — restart the worker process if it's unresponsive
   (`worker.ts`'s own health endpoint tells you if it's alive); for data
   loss, follow the full recovery procedure in
   `appbuilder-m12-backup-restore-runbook.md`.
5. **Record** — there is no in-app incident log in M12; use whatever
   incident tracker the team already uses, and cross-reference the
   `operational_events`/`audit_events` rows involved by id.
6. **Follow up** — if the root cause reveals a gap (a metric that should
   have alerted but didn't, a quota that was too tight or too loose), file
   it against the backlog below.

## Post-MVP backlog

Explicitly deferred by this milestone (not silently dropped — recorded
here so they aren't lost):

- **`next-auth` stable upgrade** (5.0.0-beta.28 → 5.0.0), cross-app,
  with full sign-in/sign-up/OAuth/email-OTP regression testing across
  Hub/Admin/AppBuilder. Highest-priority backlog item — a disclosed
  critical vulnerability, see threat model doc.
- **Automated retention deletion** for prompts, conversation messages, and
  AI job diagnostics (eligibility is already computed and tested;
  deletion needs an explicit product decision on default windows).
- **Backup artifact lifecycle**: automated deletion of expired backup
  objects from storage (retention metadata already recorded, no sweep
  yet).
- **Broader quota enforcement**: extend `specification_versions_per_app`
  to the two lower-traffic version-creation paths
  (`lib/repositories/versions.ts#restoreVersion`,
  `lib/repositories/templateApplication.ts`) not yet wrapped with
  `withQuota`.
- **Runtime API failure observability**: aggregate generated-app runtime
  API errors into `operational_events` (currently only in server logs).
- **Correlation IDs threaded end-to-end**: currently stamped for quota
  rejections only; extend through generation/validation/deployment call
  chains.
- **In-app alerting**: wire the documented thresholds
  (`appbuilder-m12-observability-runbook.md`) into an actual notification
  path rather than requiring an operator to run the queries manually.
- **Custom domains, DNS automation, TLS issuance**: the full flow design
  exists (`appbuilder-m12-custom-domain-readiness.md`); needs a
  DNS-provider decision and dedicated implementation milestone.
- **Billing**: usage data is being preserved (`usage_events`) specifically
  so this is additive later; no billing/payment work exists or is planned
  by this milestone.
- **Code export, arbitrary integrations, new product families
  (CRM/inventory/booking templates beyond what M05 already scaffolds)**:
  explicitly out of scope per issue #41 and unchanged by M12.
