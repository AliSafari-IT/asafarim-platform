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
target.

**M13 slice F changed the last sentence of that paragraph**, which used to
read "there is no code path anywhere that accepts a client-supplied URL and
fetches it server-side." There now is exactly one:
`POST /api/apps/{appId}/conversation/references/import`. Its full policy —
https-only, no embedded credentials, port 443 only, every non-public address
class refused, obfuscated and IPv4-mapped literals decoded first, **all**
resolved addresses checked (not just the first), and the whole policy
re-applied to every redirect hop — is documented in
`docs/appbuilder-m13-public-references.md`. It is an **editor** capability,
never a viewer one: a read-only collaborator must not be able to use the
platform as an outbound request proxy.

**M13 slice G additions.** The route is now behind its own feature flag
(`APPBUILDER_URL_IMPORTS_ENABLED`, default **off**), so a deployment that has
not accepted the outbound-request policy makes no outbound request at all,
and a refusal is recorded as `reference.disabled_by_flag`. The readiness
section for URL import deliberately **probes nothing** — a readiness endpoint
that made an outbound request to prove outbound requests work would itself be
an SSRF surface.

**Residual risk, unchanged and still open**: Node's `fetch` re-resolves the
hostname itself, so a name whose DNS answer changes between our check and the
connection can still be connected to (TOCTOU rebinding). Closing it fully
requires pinning the checked address into the connection via a custom undici
dispatcher. Slice F deferred this to slice G and **slice G has not closed
it** — it is a connection-layer change with its own risk, and shipping it
under time pressure alongside eight other workstreams was judged worse than
carrying the documented risk. The compensating controls remain: every hop
re-validated, an 8s whole-request timeout, a 512 KB streamed size cap, a
content-type allowlist, no credentials sent, nothing echoed back beyond
bounded extracted text, and a daily per-app outbound-fetch quota.

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

## M13 additions to this threat model

### Attachment content as a second copy (slice G fix)

**Threat**: a user deletes an uploaded file believing it is gone. Before
slice G, `deleteAttachment` removed the object from storage and left
`extracted_text` — a plain-text copy of the file's contents — in the
database. "Delete" removed the harder-to-read copy and kept the easier one.

**Mitigation**: deletion now clears `extracted_text` and leaves a tombstone
carrying filename, type, size, hash, uploader, and deletion time — enough to
answer "what was here and who removed it" without retaining the content.
Owner erasure (`DELETE /api/apps/{appId}/data`) does the same across every
category at once. Covered by `lib/retention/appData.integration.test.ts`,
which asserts no second copy survives anywhere.

### Telemetry as an exfiltration path

**Threat**: an observability surface built to monitor a system that handles
private files becomes a way to read those files — an event payload carrying a
prompt, an operational log carrying extracted text, a metrics endpoint that
sums over `extracted_text` and returns a sample of it.

**Mitigation**: every M13 event kind is enumerated in
`lib/observability/events.ts#M13_EVENT_KINDS` and none carries prompt text,
conversation content, extracted attachment text, reference bodies, resolved
addresses, or URL paths — only counts, codes, durations, hosts, and stable
spec ids. `lib/observability/metrics.ts` reads the *length* of extracted text,
never the text. Asserted directly:
`lib/observability/metrics.integration.test.ts` seeds a known secret string
into a file and a fetched page and asserts it appears in no metric payload;
`lib/features/featureFlags.integration.test.ts` asserts a blocked import's
event carries the host but neither the path nor a query token.

### Correlation ID as an injection vector

**Threat**: the `x-correlation-id` header is caller-controlled and ends up in
a persisted column and a response header — a natural place to attempt log
injection, header splitting, or stored XSS in whatever renders the events.

**Mitigation**: format validation against `^[A-Za-z0-9_-]{8,64}$`, with a
malformed value **discarded and replaced** rather than sanitized (a sanitizer
is one missed character from the same bug). The id grants nothing, addresses
nothing, and is never used for authorization, idempotency, or lookup, so a
reused or guessed value cannot reach another user's data. Covered by
`lib/observability/correlation.test.ts`.

### Shadow evaluation as an unreviewed mutation path

**Threat**: a dark-launch harness that runs a full decision pipeline is one
accidental call away from applying operations nobody reviewed.

**Mitigation**: structural rather than disciplinary —
`lib/modification/shadow.ts` never imports `applyOperation`,
`appendSystemMessage`, `transitionStatus`, or `createModificationPlan`, so
the write path is unreachable from it and a reviewer can verify that from the
import list. Its only write is one operational event. Confirmed observably by
`lib/modification/shadow.integration.test.ts` (version unchanged, no batch,
no plan, no message).

### Export as a privilege-escalation target

**Threat**: `GET /api/apps/{appId}/data` returns every message, extracted
file, and imported page in one response — a far broader read than any single
existing capability, and the natural target for anyone who obtains
collaborator access.

**Mitigation**: owner-only (`app.exportData`), never editor. Served
`Content-Disposition: attachment` with `Cache-Control: no-store, private`,
never inline. Storage keys are excluded (as everywhere else in M13). Erasure
additionally requires the app id restated in the body, so an accidental or
CSRF-shaped call is insufficient on its own.

### Feature flag as a false sense of containment

**Threat**: an operator disables a capability after an incident and assumes
the data it produced is now inaccessible.

**Mitigation**: documented explicitly rather than implemented misleadingly. A
disabled flag stops **new writes only**; existing attachments stay
downloadable and existing references keep grounding context. That is
deliberate — making history unreadable is the failure mode a rollback is
supposed to avoid — but it means a flag is a capability switch, **not** a
containment measure. To make content inaccessible, use erasure.

### Automated security-relevant tests added in M13 slice G

`lib/observability/correlation.test.ts` (header injection refusal),
`lib/observability/metrics.integration.test.ts` (no user content in any
metric; app scoping), `lib/observability/m13Readiness.test.ts` (unconfigured
dependencies never report healthy; no credential values echoed),
`lib/retention/appData.integration.test.ts` (owner-only export/erasure,
cross-app scoping, no second copy after erasure),
`lib/features/featureFlags.integration.test.ts` (ingress refused, history
readable, no URL path in a refusal event), and
`lib/modification/shadow.integration.test.ts` (no mutation, no decision text
persisted).
