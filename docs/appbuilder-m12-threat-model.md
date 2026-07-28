# M12 Threat Model

Per-category coverage for every threat the issue calls out, with the
concrete mitigation and where it's tested. Findings are listed honestly,
including the one left unresolved and why.

## IDOR / cross-app / cross-owner leakage

**Mitigation**: `lib/repositories/authz.ts#assertCapability` is the single
chokepoint every app-scoped repository call goes through — there is no
lower-level "get app by id" that skips it. An unrelated actor gets
`NotFoundError` (404) — indistinguishable from a nonexistent app; a related
actor under-ranked for the capability gets `ForbiddenError` (403). Every
M12 addition follows this exactly: `app.viewOperations` and
`app.manageCustomDomainRequest` are entries in the same `CAPABILITY_MIN_ROLE`
map, not a parallel mechanism.

**Tested**: `lib/repositories/isolation.integration.test.ts` (pre-existing,
exhaustive), plus M12-specific: `lib/observability/readiness.integration.test.ts`
("never lets an unrelated actor discover the app exists", "cross-app
isolation... never reflects another app's data"),
`lib/customDomains/requests.integration.test.ts` ("an unrelated actor
cannot discover or manage the request"), and end-to-end in
`tests/e2e/specs/m12-launch-hardening.spec.ts` ("an unrelated actor gets a
404, never the dashboard").

## Prompt injection

**Mitigation**: pre-existing, unchanged by M12 —
`lib/validation/gates/unsafeContentPolicy.ts` (a mandatory validation gate)
rejects script/event-handler injection and dangerous config keys via
`@asafarim/appbuilder-schema#validateSpecification`, and separately
allowlists external URLs to `*.asafarim.com` only. The AI pipeline
(`@asafarim/appbuilder-ai`) treats every model response as untrusted output
re-validated by the same pure operation engine as a human edit — a
successful injection still has to produce a structurally valid, policy-
passing specification to have any effect.

## XSS

**Mitigation**: pre-existing, unchanged by M12 — `SafeMarkdown.tsx`
(`app/apps/[appId]/workspace/`) is an allowlisted markdown SUBSET renderer
(bold/italic/inline-code/bullets only) that builds real React elements with
plain-string children; there is no `dangerouslySetInnerHTML` anywhere in
the conversation rendering path, so model or user text cannot inject
markup regardless of content. M12's own new UI (`OperationsView.tsx`)
renders every dynamic value through JSX text interpolation, never raw HTML.

## Unsafe URLs / SSRF

**Mitigation**: the specification-level allowlist
(`unsafeContentPolicy.ts`, above) bounds what URL any generated app's
branding/links can point at. The only outbound `fetch()` call in
`lib/` (`lib/deployment/pipeline.ts`'s post-activation verification) targets
a **fixed, server-controlled** `APPBUILDER_INTERNAL_ORIGIN` — the varying
part is only the `Host` header (itself derived from the release's own
`productionHost`, computed at release-preparation time from a slug already
validated against `RESERVED_APP_SLUGS`/`DNS_LABEL_RE` in
`lib/routing/resolveAppHost.ts`), never an arbitrary external network
target. There is no code path anywhere that accepts a client-supplied URL
and fetches it server-side.

## File upload abuse

**Mitigation**: pre-existing (M09), unchanged by M12 —
`lib/generated-data/files.ts#initUpload` validates declared MIME/size
against the field's own allowlist; `commitUpload` re-verifies the actual
byte length against the declared size (a client cannot declare "10 bytes"
and upload 50MB) and never trusts a client-supplied storage key
(`buildKey` always mints a fresh, random one). **M12 addition**: a
`storage_bytes_per_app` quota check (bounded-race, documented in
`appbuilder-m12-quota-policy.md`) now also bounds cumulative storage cost
per app, not just per-file size.

## Signed-download abuse

**Mitigation**: pre-existing, unchanged — `getDownloadAuthorization`/
`downloadFile` (`lib/generated-data/files.ts`) mint a short-lived (5
minute), single-file, single-principal HMAC-signed token
(`timingSafeEqual` comparison), never an unrestricted key passthrough.

## Secret leakage

**Mitigation**: `lib/validation/redaction.ts` (`redactDiagnostics`) is
applied to every diagnostic string before it's persisted as a
`deployment_steps.detail`, `validation_gate_results.evidence`, or
`repair_attempts.diagnosticsSummary` — reused directly by M12's new
`deploymentSteps`/backup code paths rather than reimplemented.
`backup_runs`/`restore_rehearsals` never store connection strings or
credentials — only a storage key/path, a checksum, and a byte count.

## Unsafe worker/job payloads

**Mitigation**: pre-existing pattern, unchanged — every BullMQ dispatch
message (`lib/server/queue.ts`) carries only an opaque row ID, never a
payload the worker trusts for authorization or content; the worker always
re-reads the row from Postgres (the durable source of truth) before acting.
M12 adds no new job/queue type that deviates from this.

## Destructive migration abuse

**Mitigation**: migrations are generated via `drizzle-kit generate` and
reviewed as plain SQL in this PR (`lib/db/migrations/0009_*.sql`,
`0010_*.sql`) — no code path in this application generates or applies
migrations at runtime from user input. The backup/restore tooling's own
`DROP DATABASE`/`CREATE DATABASE` calls (`lib/backup/runRestoreRehearsal.ts`)
are gated by `lib/backup/safety.ts#assertNotProduction` (three independent
checks — unit-tested, see `lib/backup/safety.test.ts`) specifically to
prevent this class of abuse against the real database.

## Quota bypass / denial-of-wallet

**Mitigation**: the entire M12 quota subsystem — see
`appbuilder-m12-quota-policy.md`. Race-safety (the core anti-bypass
property) is proven under genuine concurrent load against real Postgres in
`lib/quotas/quotas.integration.test.ts`; retry-safety (idempotency cannot
be used to bypass a quota) is proven in the same file.

## Unauthorized deployment/rollback

**Mitigation**: pre-existing (M11), unchanged — `app.deployRelease` is an
owner-minimum capability; every deployment/rollback creation call goes
through `assertCapability`. **M12 addition**: `concurrent_deployment_jobs_per_app`
now also bounds how many deployments one app can have in flight, closing a
gap that existed even pre-M12 (no such check existed before).

## Custom-host routing attacks

**Mitigation**: pre-existing (M11) fail-closed host normalization/parsing
(`lib/routing/resolveAppHost.ts`) is unchanged. **M12 addition**:
`custom_domain_requests.requested_host` has a partial unique index
(excluding cancelled rows — `lib/db/migrations/0010_*.sql`) preventing two
apps from ever claiming the same host, tested directly in
`lib/customDomains/requests.integration.test.ts` ("prevents collisions").
The feature remains fully inert (`APPBUILDER_CUSTOM_DOMAINS_ENABLED`
unset) — no routing decision anywhere in this codebase reads from
`custom_domain_requests`.

## Environment-scoping failures (preview vs. production)

**Mitigation**: pre-existing (M09/M11), unchanged —
`lib/generated-data/environment.ts`'s fail-closed derivation (Host-header
match against an active `appDomains` row → production; the builder's own
`/preview` route → preview; everything else defaults to preview). **M12
addition**: every new quota/usage record (`usage_events`) carries an
`environment` column so future cost analysis can distinguish preview from
production load, and `sumStorageBytesForApp` deliberately sums BOTH
environments together (one storage cap per app, not per environment) —
a scoping decision made explicit in code comments, not accidental.

## Dependency / container scan findings

`pnpm audit --prod` against `apps/appbuilder` reports:

```
34 vulnerabilities found
Severity: 16 moderate | 15 high | 3 critical
```

All three **critical** findings trace to a single package:
`next-auth@^5.0.0-beta.28` (and its `@auth/core` dependency), pinned to a
pre-release version with three disclosed critical advisories (an
existence-check fail-open bug and two Unicode-homoglyph email-normalization
bypasses), patched in `next-auth@5.0.0` (stable).

**This is deliberately left unresolved in this PR.** `next-auth` is a
**shared, platform-wide dependency** — `apps/admin`, `apps/appbuilder`, and
`apps/hub` all depend on the same pinned version, and Hub is the platform's
single sign-on authority every other app trusts. Bumping it blind, from
within an AppBuilder-scoped milestone, risks breaking authentication across
the entire platform without the cross-app regression testing such a change
needs (session shape changes, callback signature changes, and cookie
behavior all commonly shift between next-auth majors). Fixing it correctly
requires a dedicated, cross-app task that upgrades and re-verifies sign-in/
sign-up/OAuth/email-OTP flows for every app that depends on it — explicitly
out of "AppBuilder M12" scope per the milestone's own boundary ("do not
start work beyond M12"). Flagged as a high-priority, platform-wide follow-up
(see `appbuilder-m12-launch-checklist.md`'s backlog) rather than silently
ignored or excluded from this report.

The remaining moderate/high findings are transitively-pulled dev-time-only
tooling (`prisma`'s own bundled dev CLI dependencies — `valibot`, etc., via
`@prisma/dev`) not present in any production runtime path; several use of
`pnpm why <package>` to trace them confirms none reach `apps/appbuilder`'s
actual served code.

## Automated security-relevant tests added in M12

Beyond the pre-existing isolation suite (already exhaustive for IDOR/
cross-owner leakage), M12 adds: `lib/quotas/quotas.integration.test.ts`
(quota-bypass/denial-of-wallet), `lib/backup/safety.test.ts` (destructive-
restore prevention), `lib/customDomains/requests.integration.test.ts`
(custom-host collision prevention + authorization), and
`lib/observability/readiness.integration.test.ts` (cross-app/cross-owner
leakage of operational data specifically). No test was excluded or skipped
to avoid surfacing a failure — every test file above is part of the normal
`pnpm test`/`pnpm test:integration` run.
