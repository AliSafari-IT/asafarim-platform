# M13 slice G — Hardening, rollout, and quality gates

Slice G is the milestone's last slice and adds no user-facing capability.
Its job is to make the six that came before it operable: to make one
conversational change traceable end to end, to make every dependency say
plainly whether it is configured, to let each capability be switched off
without breaking what it already produced, and to give an owner a way to see
and destroy what the platform retains about them.

Implemented in `apps/appbuilder/lib/features/*` (flags), `lib/observability/*`
(correlation, metrics, cost rates, M13 readiness), `lib/modification/shadow.ts`
(dark launch), `lib/retention/*` (sweeps, export, erasure), `eval/releaseGates.ts`
(gates), and `app/api/apps/{appId}/data/route.ts` (export/erasure).

## Correlation IDs

`operational_events.correlation_id` has existed since M12 and nothing ever
wrote to it. One M13 change now spans an HTTP request, a job, one or more
provider calls, a plan of further jobs, and background attachment work — so
slice G threads a single id through all of it.

| Where | How |
|---|---|
| Inbound | `x-correlation-id` header, accepted only if it matches `^[A-Za-z0-9_-]{8,64}$` |
| Minted | A fresh UUID when absent or malformed — never a failed request |
| Persisted | `modification_jobs.correlation_id`, `conversation_attachments.correlation_id`, `operational_events.correlation_id` |
| Returned | `x-correlation-id` on every M13 route's response, success or error |

A malformed inbound id is **discarded and replaced**, never sanitized. The
value reaches a persisted column and a response header, so accepting caller
text would make it a log-injection and header-splitting vector, and a
sanitizer is one missed character from the same bug.

Accepting a caller-supplied id is safe because the id grants nothing,
addresses nothing, and is never used for authorization, idempotency, or
lookup. The worst outcome from a reused id is two requests sharing a trace
label.

An idempotent retry returns the **original** job's correlation id, not the
retry's — the retry is the same request, and a fresh id would split one
thread in two.

Jobs created before slice G are not backfilled. `correlationIdForJob` derives
a stable `job-<id>` for them, which keeps that job's own events joinable
without inventing a link to an HTTP request nobody recorded.

## Metrics

`lib/observability/metrics.ts` computes every figure from persisted rows —
`conversation_attachments`, `modification_jobs.context_manifest`,
`modification_plan_steps`, `conversation_references`, `operational_events` —
never from in-process counters that drift, reset on deploy, or disagree with
what an operator can see for themselves.

| Group | Examples |
|---|---|
| Attachments | Rows by status, bytes held, extracted characters, quarantines, unscanned commits, p50/p95 processing seconds, swept and overdue unclaimed uploads |
| Context | Mean estimated tokens, jobs with truncation/omission, redaction-flag counts, mean history turns and memory facts |
| Resolver | resolved / ambiguous / unresolved, resolution rate, mean confidence, matches by strategy |
| Clarification | Rounds asked, answered, abandoned, exhausted, answer rate |
| Plans | Created, completed, stopped, steps applied/failed/skipped, plans carrying capability gaps |
| Decisions | Jobs by status and failure code, capability-gap outcomes, provider errors |
| References | Rows by adapter, imports, blocks, fetch failures, rate limits, refreshes, stored characters |
| Tokens | Prompt/completion/total and provider calls, broken down by model |
| Storage | Attachment bytes, reference characters, memory rows, unclaimed bytes |
| Cost | An **estimate**, from a checked-in rate table |

Two rules the whole module follows:

- **Nothing reads user content.** Attachment metrics read status, sizes, and
  the *length* of extracted text — never the text. Context metrics read the
  safe manifest, never the prompt. Reference metrics read host and adapter,
  never the body or the URL path.
- **Absence is reported as absence.** Every rate is `null` when its
  denominator is zero, never `0`. A dashboard reading 0% failures because
  nothing ran is the same misreport `ReadinessStatus` exists to prevent.

### Cost is an estimate, and says so

`lib/observability/costRates.ts` is a small checked-in table of list prices
plus an `APPBUILDER_MODEL_COST_RATES` JSON override for negotiated pricing.
Fetching live pricing would make a metrics read do an outbound request to a
vendor; deriving it from the usage ledger is circular, since the ledger
records usage and the missing part is price.

A model with **no configured rate contributes zero cost and is named in
`unratedModels`**. Guessing would be worse than a visible gap, and silently
absorbing it into a total that looks complete would be worse still.

## Readiness

`lib/observability/m13Readiness.ts`, surfaced under `m13` on the
`GET /api/apps/{appId}/operations` snapshot.

| Section | Healthy when | Never healthy when |
|---|---|---|
| `storage` | A remote bucket, endpoint, and credentials are all set | Production with no remote bucket — uploads land on container-local disk and vanish on redeploy |
| `extraction` | — (permanently `degraded`) | Images and PDFs are accepted and yield no text; attachments stuck in `processing` are `unhealthy` |
| `malwareScanning` | A real adapter is registered | Production with no scanner (commits already fail closed); an unregistered adapter name in any environment |
| `modelVision` | Vision enabled, image parts implemented, provider retention documented | Vision enabled while no provider path sends image parts |
| `urlImport` | The flag is on | — (off reports `not_configured`) |
| `cleanupLag` | Nothing is past its retention deadline | More than 50 overdue rows |
| `evaluation` | Always — reports `EVALUATION_VERSION` | — |

Two properties are load-bearing:

- **Nothing probes anything.** No test upload, no outbound fetch, no model
  call. A readiness endpoint that made an outbound request would itself be an
  SSRF surface (the reasoning slice F applied to `referenceImport`), and one
  that wrote a test object would make "check readiness" a mutation.
- **"Off on purpose" and "broken" are different.** A feature disabled by its
  flag is `not_configured`, never `unhealthy`. Only a genuine misconfiguration
  — a feature switched *on* whose dependency is missing — is `unhealthy`, and
  only `unhealthy` sections reach `launchBlockingIssues`. Otherwise every
  deployment would carry a permanent blocker it could not clear.

Viewers get `m13: null` and `m13Metrics: null` (deployment configuration and
cost are owner/editor information), but `launchBlockingIssues` reaches every
role — an app whose attachments are about to be wiped by a redeploy is
exactly what that list is for.

## Feature flags

Five independent env switches. There is deliberately **no master flag**: one
typo must not be able to disable five things, and the slice's exit criterion
("each feature can be disabled without making history unreadable") is only
checkable if each is genuinely its own switch.

| Flag | Env var | Default | With it off |
|---|---|---|---|
| Attachments | `APPBUILDER_ATTACHMENTS_ENABLED` | **on** | No new uploads or claims. Existing attachments stay listable, downloadable, and part of grounded context; deletion still works. |
| Vision | `APPBUILDER_VISION_ENABLED` | **off** | Images are never sent to a model. They stay attached; context discloses `vision_unavailable`. |
| Contextual memory | `APPBUILDER_CONTEXTUAL_MEMORY_ENABLED` | **on** | Memory is neither recalled nor written. Rows are retained and still deleted with their source messages. |
| Planning | `APPBUILDER_PLANNING_ENABLED` | **on** | No new plans. A multi-step decision executes its first step and reports the rest as an unmet gap. Existing plans still advance. |
| URL imports | `APPBUILDER_URL_IMPORTS_ENABLED` | **off** | No outbound fetch; import and refresh are refused. Existing references still ground context at their real freshness. |

Only the exact strings `"true"` and `"false"` are honoured. `yes`, `1`, `on`,
and `TRUE` fall back to the documented default — `APPBUILDER_VISION_ENABLED=yes`
silently enabling image upload to a third-party provider is the accident this
avoids.

Attachments, memory, and planning default **on** because slices B–E shipped
them as the milestone's core behavior. Vision and URL import default **off**
because each needs something an operator must consciously provide: a
vision-capable provider deployment with documented retention, and an accepted
outbound-request policy.

### Disabled means "no new writes", never "hide the past"

A disabled flag gates the *ingress* path only. Making history unreadable is
the failure mode a rollback is supposed to avoid, so hiding rows behind a flag
would defeat the point of having the flag. `FeatureDisabledError` is a
409-family error carrying `code: "feature_disabled"` and the flag name, so the
composer can disable exactly the affected control — not a 403, because nothing
about the caller's authorization is wrong, and sending an editor to ask for a
permission that would not help is a bad answer.

## Dark launch

`APPBUILDER_SHADOW_EVALUATION_ENABLED=true` runs `lib/modification/shadow.ts`
after each real interpretation: the full grounded pipeline and a real provider
call, scored and recorded, then thrown away.

The context is assembled with the M13 capabilities **forced on** regardless of
the deployment's flags. A shadow that mirrored the live flags would re-run the
same computation with the same inputs and learn nothing while paying for a
second provider call; the gap between the two configurations is the entire
signal, and the `shadow.evaluated` event records which flags it overrode.

The no-mutation guarantee is **structural, not disciplinary**: the module
never imports `applyOperation`, `appendSystemMessage`, `transitionStatus`, or
`createModificationPlan`. A shadow run cannot mutate a specification because
the code that mutates specifications is not reachable from it — verifiable
from the import list alone. Its only write is one operational event carrying
outcome, counts, confidence, and token usage; never a summary, question,
assumption, or operation payload. It never throws into its caller, because an
observation-only feature must not become a new outage source.

Off by default: it costs a second provider call per request.

## Retention, export, and erasure

### Sweeps

`pnpm --filter @asafarim/appbuilder retention:sweep [--apply]` now runs three
categories. `sweepUnclaimedAttachments` **existed since slice B and nothing
outside tests ever called it** — the 24-hour unclaimed-upload deletion the
milestone promises was implemented and never ran. That is the gap `cleanupLag`
now makes visible: a sweep that is not scheduled shows up as a growing overdue
count rather than as silence.

| Category | Rule |
|---|---|
| `validation_artifacts` | Past `retentionExpiresAt` — object then row |
| `conversation_attachments` | Unclaimed (`pending`/`uploaded`/`processing`) for 24h — hard-deleted |
| `conversation_memories` | Facts whose source messages have **all** been deleted |

One sweep failing does not stop the others, and any failure sets exit code 1
so a half-failed scheduled run is not reported as success.

Memory pruning has three deliberate bounds: any surviving source keeps the
fact; a fact with no `sourceMessageIds` is kept (preferences are source-free
by construction, and treating "none listed" as "none exist" would delete
exactly the facts that were never message-derived); and the row is rewritten
rather than deleted, since one row per conversation is a unique-indexed
invariant.

### Export and erasure

`GET /api/apps/{appId}/data` and `DELETE /api/apps/{appId}/data`, both
owner-only (`app.exportData` / `app.eraseData`), both allowed while archived —
an archived app is the *most* likely subject of such a request.

Export returns messages, attachment metadata and extracted text, references
with provenance and text, memory facts, plans, jobs, and the retention policy
each category falls under. It never returns a storage key. Attachment **bytes**
are not inlined — one export would be hundreds of megabytes in memory, and
each file is already downloadable through its own authenticated route; that is
stated in the response's `notIncluded` field rather than left for the reader to
discover. Served as `Content-Disposition: attachment` with `Cache-Control:
no-store`, because it is the most sensitive response the API produces.

Erasure requires `{ "confirm": "<appId>" }` in the body — an irreversible
action bound to the exact thing being destroyed, mirroring M08's destructive
confirmation, and enough that an accidental or CSRF-shaped call is
insufficient on its own.

It destroys message bodies, attachment objects and extracted text, reference
text and facts, all memory facts, and each job's stored request text. It keeps
the app, its specification and versions, the row skeletons (so the workspace
renders a coherent history rather than one with holes in it), and
`audit_events` — an erasure that erased its own evidence would be unauditable.

Two related fixes landed alongside it: explicitly deleting an attachment now
also clears its `extracted_text`, and the retention catalogue gained
`ownerErasable` plus the two M13 categories (`conversation_attachments`,
`conversation_memory`) it had been missing. Previously "delete this
attachment" removed the object in storage and left a readable copy of its
contents in a database column.

## Release gates

`eval/releaseGates.ts` turns the milestone's release-target table into
something a run can fail on. Corpus version: **`m13.1.0`** — bump it on any
change to cases, expected labels, or scoring, or two runs reporting the same
version could mean different things.

| Gate | Target | Source |
|---|---|---|
| Unique exact target resolution | ≥ 98% | scorer |
| Unnecessary clarification | ≤ 5% | scorer |
| Necessary clarification precision | ≥ 95% | scorer |
| Schema-valid operations | ≥ 99% | scorer |
| Capability classification accuracy | ≥ 95% | scorer |
| Cross-app attachment access | 0 | `attachments.integration.test.ts` |
| Destructive apply without confirmation | 0 | `pipeline.integration.test.ts`, `confirmation.test.ts` |
| Cleanup within retention window | ≥ 99.9% | `sweep.integration.test.ts`, `cleanupLag` readiness |

Two rules:

- **A `null` rate is not a pass.** A metric whose denominator was zero means
  the corpus never exercised it. That is a corpus problem, reported as
  `not_measured` and treated as blocking — treating "never measured" as "met
  the bar" is how a quality gate becomes decorative.
- **Zero-tolerance gates are counts, not rates**, and are never auto-passed.
  They cannot be expressed as a percentage without implying some non-zero
  number would be acceptable, and the scorer cannot see them, so they are
  declared with a pointer to the suite that owns them and confirmed from there
  before release.

### Known corpus limitation

`unnecessaryClarification` is currently the complement of
`clarificationPrecision` — with today's corpus they are two readings of one
measurement, because the scorer records whether the clarify/don't-clarify call
was right, not in which direction it was wrong. Splitting them properly needs
the corpus to distinguish over- from under-asking per case. Reported honestly
rather than as a second number that looks independent and is not; this is the
next corpus change, and the reason `EVALUATION_VERSION` exists.

## Rollout

Each stage holds until its gates pass. Nothing here requires a code change
between stages — every control is an env var, so a stage can be advanced or
reversed by a deploy-time decision.

**Stage 0 — internal.** Attachments, memory, and planning on; vision and URL
import off. `APPBUILDER_ATTACHMENT_SCANNER` must resolve to a real adapter
before any non-internal traffic (production already fails closed). Schedule
`retention:sweep --apply`. Confirm `m13.storage` is `healthy` and
`m13.cleanupLag` is `healthy`.

**Stage 1 — small cohort.** Same flags. Watch `attachments.overdueUnclaimed`
(should stay at 0 with the sweep scheduled), `clarification.answerRate` (a low
rate means the questions are not useful), `resolver.resolutionRate`, and
`decisions.providerErrors`. Enable shadow evaluation here if the cohort's
volume justifies the second provider call.

**Stage 2 — general availability.** Requires every scorer gate met at the
current corpus version and the three external gates confirmed from their
suites.

**URL import** is a separate decision at any stage, and is the one flag that
makes the platform send requests to hosts a user names. Turn it on only with
the SSRF policy in `docs/appbuilder-m13-public-references.md` accepted, and
watch `references.blocked`.

**Vision** cannot be enabled usefully yet: no provider path sends image parts,
so the readiness section reports `unhealthy` if the flag is on — deliberately,
because leaving it on claims a capability that does not exist. Enabling it
also requires `APPBUILDER_PROVIDER_RETENTION_DOC`, per M13's "document
provider retention before production multimodal enablement".

## Rollback

The property that makes rollback safe is that **no M13 feature owns any data
another feature needs to render history**. Turning everything off leaves every
message, attachment, reference, memory row, and plan exactly where it was.

To disable M13 behavior without a deploy:

```bash
APPBUILDER_ATTACHMENTS_ENABLED=false
APPBUILDER_CONTEXTUAL_MEMORY_ENABLED=false
APPBUILDER_PLANNING_ENABLED=false
APPBUILDER_URL_IMPORTS_ENABLED=false
APPBUILDER_VISION_ENABLED=false
APPBUILDER_SHADOW_EVALUATION_ENABLED=false
```

After that: conversations render, past attachments download, past references
still ground context at their true freshness, in-flight plans still advance,
and new requests behave as a single-step assistant. Only *new* attachments,
imports, memory writes, and plans stop.

To roll back the code: migration `0015` is additive (two nullable columns and
their indexes) and is safe to leave applied. Earlier code ignores the columns.
Do **not** revert migrations `0011`–`0014` — they hold the attachments,
memory, planning, and reference tables, and dropping them is what would make
history unreadable.

## Test coverage

| Concern | Where |
|---|---|
| Flag defaults, non-boolean coercion refusal, independence | `lib/features/flags.test.ts` |
| Ingress refused + history readable, per flag | `lib/features/featureFlags.integration.test.ts` |
| Header validation, injection refusal, retry joins original thread | `lib/observability/correlation.test.ts` |
| Unconfigured dependencies never healthy; blocking-issue selection | `lib/observability/m13Readiness.test.ts` |
| Metric aggregation, null-not-zero, no user content | `lib/observability/metrics.integration.test.ts` |
| Export completeness, no storage keys, erasure leaves no second copy, idempotency | `lib/retention/appData.integration.test.ts` |
| Unclaimed-attachment and orphaned-memory sweeps | `lib/retention/sweep.integration.test.ts` |
| Shadow runs without mutating; failure never propagates | `lib/modification/shadow.integration.test.ts` |
| Gate thresholds, `not_measured` blocks, external gates never auto-pass | `eval/releaseGates.test.ts` |
