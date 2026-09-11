# Vionto roadmap and superadmin backlog

This roadmap is derived from the checked-in Vionto application, its worker,
database models, deployment wiring, tests, and
[`docs/vionto-architecture.md`](../../../docs/vionto-architecture.md). A
milestone is marked shipped only when its main end-to-end path exists. A model,
route stub, or UI placeholder is not treated as completion.

## Review findings

Vionto has a substantial creator workflow, but its privileged operations layer
is only scaffolding today:

- `/api/admin/support/lookup` and `/api/admin/retention-enforce` repeat their
  own database role queries, accept only the literal `admin` role, and therefore
  reject the platform's `superadmin` role.
- `/api/uploads/cleanup` has a third role check with different behavior. The
  three endpoints do not share one auditable authorization decision.
- `lib/server/auth.ts` implements a second permissions resolver whose in-process
  cache has no TTL or invalidation. No Vionto permission keys are present in the
  foundation seed, so this is not yet a usable least-privilege boundary.
- There is no protected admin layout or navigation. Hiding a future link would
  not be enough: every page, route handler, and server action must enforce the
  same server-side policy.
- `ViontoAuditEvent`, `ViontoUsageMetric`, and `ViontoPlanQuota` exist, but the
  main upload, AI, TTS, render, and export paths do not yet consistently write
  audit/usage records or enforce quotas.
- The manual retry route creates a placeholder render manifest with no assets;
  a privileged retry UI must not ship until retry rebuilds or loads a trusted
  persisted manifest.
- Project and export deletion can leave object-store data behind. The current
  retention endpoint operates on age and policy fields but is not a complete,
  resumable storage-reconciliation workflow.
- Support access can expose sensitive account and project metadata. It needs
  purpose/reason capture, minimised fields, audit records, pagination, and
  explicit permission boundaries before becoming a UI.

## Privileged-access rule

The Vionto area called “Superadmin” uses this exact allow rule:

```text
active session AND (
  role contains "superadmin"
  OR (role contains "admin" AND normalized email equals "asafarim@gmail.com")
)
```

The email comparison is trimmed and lower-cased and is evaluated only from the
trusted server session/database identity. Possessing the email without the
`admin` role grants nothing. Other `admin` users are denied. UI visibility is a
convenience only and never the security boundary.

The reusable helper should accept an app policy (including allowed admin
emails) rather than embedding Vionto or this email into generic authorization
logic. This preserves the requested bootstrap rule while letting future apps
choose a stricter role-only or permission-based policy.

## Issue-ready superadmin workstream

The following items are deliberately split at independently reviewable security
and product boundaries. Their stable VSA IDs can be kept when GitHub issue
numbers are assigned.

<a id="vsa-000"></a>

## VSA-000

**Epic — reusable Vionto superadmin area**

Outcome: Vionto has a secure operations console for the requested principals,
and future apps have a proven adoption path rather than copied app code.

Acceptance criteria:

- Track VSA-001 through VSA-012 with their dependencies, owners, rollout state,
  and attached exit evidence.
- Do not expose a navigation entry, page, API, or server action before its
  server-side policy and denial tests exist.
- Release read-only modules before destructive controls; keep privileged media
  viewing and impersonation out of scope.
- Close only when VSA-011 release evidence is approved and VSA-012 demonstrates
  the shared kit against a second fixture app.

<a id="vsa-001"></a>

## VSA-001

**Approve the Vionto privileged-access policy**

Outcome: one reviewed policy and threat model defines who may enter, which data
they may see, and which actions require step-up confirmation.

Acceptance criteria:

- Encode the exact role/email rule above, including inactive and missing-email
  behavior, and decide whether the allowed email is code-owned or environment
  configured.
- Classify every planned module as read-only, operational, destructive, or
  security-sensitive; assign a permission and audit requirement to each.
- Document privacy minimisation, support-access purpose capture, session age,
  CSRF, rate-limit, and break-glass expectations.
- Record out-of-scope actions: viewing raw user photos/video, revealing secrets,
  editing roles, and impersonation are denied unless separately designed.

<a id="vsa-002"></a>

## VSA-002

**Build a reusable app-admin authorization guard**

Outcome: pages, APIs, and server actions consume one server-only authorization
decision instead of reimplementing role checks.

Acceptance criteria:

- Add a typed policy/decision helper to `@asafarim/auth` supporting
  `superadmin`, an `admin` plus normalized allowlisted email, active-session
  enforcement, and deterministic denial reasons.
- Provide redirecting page guards and non-redirecting API/action guards without
  importing client-only code.
- Derive roles and email from the trusted session and database-backed identity;
  never accept either in request input.
- Unit-test role/email casing, missing identity, inactive users, ordinary admin,
  allowlisted admin, and superadmin.

<a id="vsa-003"></a>

## VSA-003

**Seed Vionto permissions and remove stale local auth logic**

Outcome: named permissions express least privilege while the VSA access rule
remains the outer gate.

Acceptance criteria:

- Add seed-owned permissions for overview, support, renders, retention, usage,
  providers, settings, and audit; document their default grants.
- Replace direct role queries in all current Vionto admin endpoints with the
  shared guard plus the relevant permission.
- Remove Vionto's duplicate permission resolver/cache, or replace it with the
  shared database query/correctly invalidated cache.
- Reconciliation tests prove permissions are created, stable, and removable
  only under the platform seed rules.

<a id="vsa-004"></a>

## VSA-004

**Create the protected superadmin shell**

Outcome: `/superadmin` has a reusable layout and consistent denied behavior.

Acceptance criteria:

- Add a protected route group with overview, users/projects, renders, usage,
  retention, audit, and settings navigation placeholders.
- Show the entry in Vionto navigation/user controls only after the server-backed
  access decision; protect direct URLs independently.
- Re-check authorization in every page, route handler, and server action.
- Include accessible responsive navigation, loading/empty/error states, and a
  clear “privileged area” identity without leaking its presence to anonymous
  sessions through data responses.

<a id="vsa-005"></a>

## VSA-005

**Operations overview and service health**

Outcome: operators can see whether the Vionto pipeline is healthy without
opening customer content.

Acceptance criteria:

- Aggregate user/project/asset/export totals, render state counts, queue depth,
  oldest queued age, worker heartbeat, storage/database/Redis state, and AI/TTS
  provider availability.
- Use bounded queries with explicit time windows and distinguish unavailable,
  degraded, and zero.
- Do not return secrets, endpoints, bucket names, object keys, raw prompts,
  customer filenames, or media previews.
- Add freshness timestamps, partial-failure behavior, permission tests, and an
  operational runbook link for each degraded check.

<a id="vsa-006"></a>

## VSA-006

**User and project support explorer**

Outcome: an operator can diagnose an account or project with the minimum data
required for support.

Acceptance criteria:

- Replace the unbounded lookup contract with validated exact email/user/project
  lookup plus paginated, capped results.
- Show account state, project summaries, render/export metadata, and recent
  failures; customer media and provider credentials stay inaccessible.
- Require a support reason/ticket reference for detailed access and write an
  audit event containing actor, target, reason, fields accessed, and request id.
- Add IDOR, enumeration, redaction, rate-limit, and unauthorized-role tests.

<a id="vsa-007"></a>

## VSA-007

**Render queue operations and safe retry**

Outcome: failed or stalled render jobs can be diagnosed and recovered without
forging or losing their input.

Acceptance criteria:

- Persist a versioned trusted manifest or deterministically rebuild it from
  immutable job inputs; remove the current empty-assets retry placeholder.
- List/filter jobs by state, age, user, project, worker, retryability, and error
  class with bounded log excerpts and redaction.
- Support idempotent cancel/retry with confirmation, reason capture, audit, and
  queue/database reconciliation.
- Prove stale-worker, duplicate-click, already-finished, missing-object, and
  concurrent-retry behavior in integration tests.

<a id="vsa-008"></a>

## VSA-008

**Usage, quota, and provider controls**

Outcome: costly media/AI work is measured, limited, and operable before broader
production use.

Acceptance criteria:

- Meter images, storage bytes, caption/story tokens, TTS seconds, generated
  video seconds, render minutes, and exports with idempotency keys.
- Reserve quota before costly asynchronous work, commit actual usage on
  success, and release/refund on pre-output failure or cancellation.
- Add user/plan usage views and audited provider enable/disable, routing, and
  per-operation kill switches; never display credentials.
- Exercise retry/double-charge, period-boundary, over-limit, bypass, and worker
  failure behavior.

<a id="vsa-009"></a>

## VSA-009

**Retention and object-storage reconciliation**

Outcome: retention actions delete or archive the complete data graph and its
objects predictably.

Acceptance criteria:

- Produce a dry-run plan with policy reason, cutoff, affected database rows,
  object count/bytes, and legal-hold exclusions before mutation.
- Execute resumable, idempotent batches covering projects, versions, albums,
  assets, generated clips, audio, render intermediates, exports, connections,
  and object storage.
- Detect orphaned objects/rows separately; quarantine or report before deletion.
- Require high-impact confirmation and reason, emit an immutable audit/result
  manifest, and test partial storage/database failure recovery.

<a id="vsa-010"></a>

## VSA-010

**Domain audit trail and review console**

Outcome: material Vionto and privileged activity is traceable without recording
sensitive payloads.

Acceptance criteria:

- Define a typed taxonomy for project/media/AI/audio/render/export/retention,
  support-read, provider, quota, and admin events.
- Write actor, actor role, target, previous/next state, reason, request/job id,
  and allowlisted metadata with deep redaction.
- Add time/action/actor/entity filters, pagination, detail view, and a separate
  permission-gated export with bounded windows.
- Make audit writes reliable for privileged mutations and define recovery when
  the audit sink is unavailable.

<a id="vsa-011"></a>

## VSA-011

**Authorization, privacy, and recovery verification**

Outcome: the superadmin area has release evidence, not only implementation.

Acceptance criteria:

- Test anonymous, inactive, standard, ordinary admin, wrong-email admin,
  case-normalized allowlisted admin, and superadmin against every page and API.
- Cover UI hiding, direct navigation, API calls, server actions, IDOR, CSRF,
  rate limits, input bounds, log/audit redaction, and destructive confirmations.
- Add accessibility checks for the core operator journeys and load budgets for
  aggregate/list endpoints.
- Rehearse rollback, queue recovery, retention interruption, permission change,
  and recovery when the allowlisted operator loses access.

<a id="vsa-012"></a>

## VSA-012

**Extract the reusable application-admin kit**

Outcome: a second ASafarIM app can adopt the proven boundary without copying
Vionto-specific code.

Acceptance criteria:

- Extract the typed access policy/decision, route/action adapters, module
  registry contract, audit context/redaction, and destructive-action patterns
  into shared packages only after Vionto validates them.
- Keep app queries, permissions, labels, and modules injected; no Vionto model
  or the `asafarim@gmail.com` rule becomes a generic default.
- Publish an adoption checklist and example covering seeds, layout, page/API
  guards, audit, tests, denied behavior, and operator recovery.
- Add contract tests with a small second fixture app to prove the kit is
  reusable and fails closed when configuration is incomplete.

## Delivery order

1. Gate 0: VSA-001, then VSA-002 and VSA-003.
2. UI foundation: VSA-004.
3. Read-only operations: VSA-005 and VSA-006.
4. Mutating controls: VSA-007, VSA-008, and VSA-009.
5. Evidence and reuse: VSA-010, VSA-011, then VSA-012.

VSA-012 intentionally comes last: extracting an abstraction before Vionto has
validated its permission, audit, error, and recovery contracts would preserve
the wrong boundaries for every future app.
