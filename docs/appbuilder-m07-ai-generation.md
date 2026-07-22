# AppBuilder AI Requirements Planner and Generation Pipeline (M07)

**Packages:** `packages/appbuilder-ai` (`@asafarim/appbuilder-ai`)
**Consumer:** `apps/appbuilder` (Next.js app + standalone `worker.ts` process)
**Document date:** 2026-07-22
**Scope:** M07 of the delivery series tracked in
[issue #29](https://github.com/AliSafari-IT/asafarim-platform/issues/29) —
see [issue #36](https://github.com/AliSafari-IT/asafarim-platform/issues/36)
for the milestone's acceptance criteria. Builds on M03's authorization
model, M04's `@asafarim/appbuilder-schema` controlled-operation engine, M05's
creation flow, and M06's template registry + preview service
([docs/appbuilder-architecture.md](appbuilder-architecture.md),
[docs/appbuilder-runtime.md](appbuilder-runtime.md)).

## Core principle

> The model may analyze requirements and propose allowlisted operations. It
> must never generate or execute arbitrary application source code,
> JavaScript, TypeScript, HTML, SQL, shell commands, npm packages, file
> paths, infrastructure definitions, or unrestricted network requests.

The only successful output of the AI pipeline is a validated sequence of
M04 operations applied through M04's existing controlled engine
(`applyOperation`), plus one M06 preview build. Nothing else the model
returns is ever treated as authoritative — see "Prompt-injection
resistance" below for how this is enforced structurally, not just by
instruction.

## Provider boundary (`packages/appbuilder-ai`)

A server-only package with zero dependency on Next.js, the database,
Drizzle, or `apps/appbuilder`'s auth layer — mirrors the isolation
discipline of `@asafarim/appbuilder-schema` and `@asafarim/appbuilder-runtime`.

```
packages/appbuilder-ai/src/
  constants.ts             PLANNING_LIMITS, CONFIDENCE_LEVELS
  schemas/
    requirementsAnalysis.ts  RequirementsAnalysis, ClarificationQuestion
    templateRecommendation.ts
    operationProposal.ts     ProposedOperation, OperationBatch (wraps @asafarim/appbuilder-schema's Operation union)
    clarification.ts         ClarificationAnswer, ClarificationRound, ClarificationState
  provider/
    types.ts                AiProvider interface, UsageMetadata, ProviderCallOptions
    errors.ts                ProviderError, ProviderErrorCode (closed set)
    config.ts                loadAiProviderConfig() — validated server-only env
    redact.ts                redactSecrets/redactForLogging — logging safety net
  prompts/
    systemPolicy.ts          trusted system policy text + wrapUntrustedInput()
    buildAnalysisPrompt.ts / buildTemplatePrompt.ts / buildOperationPrompt.ts
  providers/
    openai.ts                OpenAI structured-outputs adapter (client.beta.chat.completions.parse)
    fake.ts                  FakeAiProvider — deterministic, scripted, network-free
    defaultFake.ts            DefaultFakeProvider — keyword-routes a prompt to a fixture scenario
  fixtures/                  Deterministic scenarios (success, clarification, adversarial, errors)
```

`AiProvider` (the only interface `apps/appbuilder` imports a concrete
provider through) exposes exactly three structured methods —
`analyzeRequirements`, `recommendTemplate`, `proposeOperations` — each
taking already-bounded input and returning a value already validated
against this package's Zod schemas, plus `UsageMetadata` (tokens/latency,
never provider secrets or raw headers). Every method accepts a
`ProviderCallOptions` carrying an `AbortSignal` (wired to job
cancellation) and a `requestId` (log correlation only).

### OpenAI adapter

`OpenAiProvider` uses `client.beta.chat.completions.parse` with
`zodResponseFormat` from `openai/helpers/zod`, so the provider's output is
already schema-constrained; anything that still fails to parse — or is
refused — is mapped to `ProviderError({ code: "malformed_response" })`
rather than returned as best-effort data. Retries are NOT handled inside
the adapter (`maxRetries: 0` on the client) — the generation pipeline owns
retry/backoff decisions so they're observable and idempotent (see
"Idempotency and retry" below).

### Fake/fixture providers (no network, no keys, no billing)

- `FakeAiProvider` (`providers/fake.ts`) replays a pre-scripted
  `FakeProviderScript` (an ordered list of `value(...)`/`errorStep(...)`
  entries per method) — the last entry repeats if called more times than
  scripted. Every scripted value is validated against the **same** Zod
  schema the OpenAI adapter validates against, so a fixture can deliberately
  script a malformed or forbidden response and get the identical
  `malformed_response` classification a real bad model output would.
- `DefaultFakeProvider` (`providers/defaultFake.ts`) is what
  `APPBUILDER_AI_PROVIDER=fake` actually runs (local dev default, CI, and
  the worker started by Playwright): it keyword-routes the untrusted
  prompt text to a known fixture (`construction`/`crew` → the
  construction task-manager fixture, `crm`/`deal` → the CRM fixture, else
  a safe blank fallback) — fully deterministic, no per-test wiring needed.
- `fixtures/adversarial.ts` — recorded scenarios for prompt injection,
  a forbidden-operation attempt, a self-approved-destructive attempt, a
  malformed response, a provider timeout-then-retry, a rate limit, and a
  specification-validation failure. Used by both `packages/appbuilder-ai`'s
  own unit tests and `apps/appbuilder`'s pipeline integration tests.

### Model configuration (`provider/config.ts`)

Validated, lazy (never read at module-import time), server-only. Never
hardcoded, never exposed to a client bundle, never logged raw
(`safeConfigSummary()` reports only `openaiApiKeyConfigured: boolean`).

| Env var | Purpose | Default |
| --- | --- | --- |
| `APPBUILDER_AI_PROVIDER` | `"openai"` \| `"fake"` | `fake` |
| `APPBUILDER_AI_OPENAI_API_KEY` | AppBuilder-specific key; falls back to the shared `OPENAI_API_KEY` | — |
| `APPBUILDER_AI_OPENAI_MODEL` | falls back to shared `OPENAI_MODEL` | `gpt-4o-mini` |
| `APPBUILDER_AI_REQUEST_TIMEOUT_MS` | per-call timeout | `30000` |
| `APPBUILDER_AI_MAX_RETRIES` | provider-level retry budget knob (pipeline owns actual retry loop) | `2` |
| `APPBUILDER_AI_MAX_TOOL_CALLS` | structured-output/tool-call ceiling | `40` |
| `APPBUILDER_AI_MAX_ITERATIONS` | planning iterations per job | `4` |
| `APPBUILDER_AI_CONCURRENCY` | reserved for future concurrent-provider-call tuning | `2` |
| `APPBUILDER_AI_MAX_OUTPUT_TOKENS` | falls back to shared `OPENAI_MAX_OUTPUT_TOKENS` | — |
| `APPBUILDER_WORKER_CONCURRENCY` | BullMQ worker concurrency (infra-level, not a provider knob) | `2` |
| `APPBUILDER_WORKER_HEALTH_PORT` | worker's own health endpoint | `3008` |

## Durable job model

`generation_jobs` (`apps/appbuilder/lib/db/schema.ts`, migration
`0004_appbuilder_m07_generation_jobs.sql`) — one durable row per generation
attempt, in AppBuilder's own isolated Postgres (never the shared platform
DB). Columns (grouped):

- **Identity/linkage:** `id`, `appId`, `creationRequestId`,
  `initiatedByPrincipalId`.
- **Lifecycle:** `status`, `phase` (free-text sub-phase, descriptive only —
  never branched on), `attemptCount`.
- **Idempotency:** `idempotencyKey`, `requestHash` (unique on
  `(appId, idempotencyKey)`).
- **Concurrency baseline:** `baseVersionNumber`.
- **Planning state:** `requestedTemplateId`, `selectedTemplateId`,
  `templateSelection` (jsonb `TemplateSelectionRecord`),
  `normalizedRequirements` (jsonb `RequirementsAnalysisType`),
  `clarificationState` (jsonb `ClarificationStateType`),
  `totalOperationsApplied`.
- **Result:** `resultingVersionNumber`, `resultingVersionId` (FK,
  `set null`), `resultingPreviewBuildId` (FK, `set null`).
- **Provider/usage:** `providerName`, `providerModel`, `usage` (jsonb
  cumulative token/latency counters — never provider secrets).
- **Failure:** `failureCode` (closed enum), `failureMessage` (always the
  safe, user-facing string — see "Error classification").
- **Cancellation:** `cancelRequestedAt`, `cancelledByPrincipalId`.
- **Lease/heartbeat:** `leaseOwner`, `leaseExpiresAt`, `heartbeatAt`.
- **Timestamps:** `startedAt`, `completedAt`, `createdAt`, `updatedAt`.

`generation_operation_batches` — one row per operation-proposal iteration
(audit trail + per-iteration idempotency): `iteration`, `reasoningSummary`,
`isFinalBatch`, `proposedOperationCount`, `appliedOperationIds` (ordered
ids into `applied_operations`), `status` (`applied`/`rejected`),
`rejectionReason`. Unique on `(jobId, iteration)`.

### State machine (`lib/generation/stateMachine.ts`)

```
queued -> analyzing
analyzing -> needs_clarification | planning
needs_clarification -> analyzing        (resume after answers)
planning -> applying
applying -> planning (next iteration) | validating (final batch / budget exhausted)
validating -> preparing_preview
preparing_preview -> ready
<any non-terminal status> -> cancelled | failed
ready | failed | cancelled -> (terminal, no transitions out)
```

`canTransition`/`assertTransition` are the single place transition
legality is decided — `transitionStatus()` (the only repository function
that changes `status`) always calls this first and additionally does a
compare-and-swap `UPDATE ... WHERE status = from` so a lost race throws
`StaleJobStateError` instead of silently clobbering a concurrent writer.
Bookkeeping fields that change mid-phase without a status change (e.g.
recording the selected template) go through `updateJobFields()` instead,
which never touches `status`.

## Trusted actor model

The initiating user's platform SSO id is captured once, at enqueue time,
from the authenticated session (`getActor()` — never from a client-supplied
field) and stored as `generation_jobs.initiatedByPrincipalId`. The
background worker has no session of its own; rather than inventing a
"system" principal, it **replays the initiating user's own identity** for
every repository call (`actingAsInitiator(job)` in `lib/generation/pipeline.ts`
— `{ principalId: job.initiatedByPrincipalId, roles: [] }`, deliberately
omitting any superadmin bypass that user might separately hold).

Because `assertCapability` (M03) always re-derives access from the
**live** `apps.ownerPrincipalId`/`collaborators` rows, not from anything
cached on the job, this gives "recheck authorization before applying
changes" and "fail safely without mutating the specification if access was
lost" for free: if the initiating user's ownership/collaborator row was
revoked after enqueue, the very first `assertCapability` call inside
`applyTemplateVersion`/`applyOperation`/`requestPreviewBuild` throws
`ForbiddenError`/`NotFoundError` — classified as `authorization_lost` (see
below) — before any write happens.

Audit records distinguish `initiatedBy` (the human) from the fact that a
background process executed the work: every audit event the pipeline
writes carries `actorPrincipalId: job.initiatedByPrincipalId`, and the
`generation.requested`/`generation.completed`/`generation.failed`/
`generation.cancelled` action strings themselves make clear these are
job-lifecycle events, not direct user actions, without needing a forged
"system user" identity anywhere in the schema.

**Cancellation always requires a real authorized session** — the worker
process can never self-cancel; only `POST /api/apps/{appId}/generation-jobs/{jobId}/cancel`
(gated by `getActor()` + the `app.cancelGeneration` capability) can set
`cancelRequestedAt`.

## Generation pipeline (`lib/generation/pipeline.ts`)

`runGenerationJob(deps, job)` drives a claimed job forward, phase by
phase, until it reaches a terminal status, yields at
`needs_clarification`, the lease is lost to another worker, or a
retryable provider error requires backing off to a later attempt:

1. **Load and authorize the creation request** — `assertCapability`
   inside every repository call the phase makes.
2. **Load the immutable base specification/version.**
3. **Analyze** the prompt (+ prior clarification answers) into
   `RequirementsAnalysis` via `provider.analyzeRequirements`.
4. **Detect ambiguity** — `requiresClarification()` is authoritative
   (true when the model self-reports `confidence: "low"` or returns any
   `clarificationQuestions`); the pipeline never re-derives "is this
   ambiguous" itself.
5. **Return clarification questions** — persists a new round on
   `clarificationState`, transitions to `needs_clarification`. Bounded to
   `PLANNING_LIMITS.MAX_CLARIFICATION_ROUNDS` rounds; exceeding it fails
   the job (`invalid_request`) rather than looping forever.
6. **Select a template** — `provider.recommendTemplate`, validated
   against `@asafarim/appbuilder-runtime`'s `getTemplate()`; an unknown
   id falls back to the user's own originally-requested starter family
   (always a valid, registered id) rather than failing the job.
   `templateSelection` records the request, the recommendation, the
   final selection, and whether they differ.
7. **Apply the template** as a new specification version
   (`lib/repositories/templateApplication.ts#applyTemplateVersion`) — a
   bulk starting point, not an M04 operation (no operation in the
   allowlisted union bulk-replaces a whole spec), but still fully
   `validateSpecification`-checked before persisting, and idempotent per
   job (`${jobId}:template`).
8. **Propose a bounded operation batch** — `provider.proposeOperations`,
   capped by `PLANNING_LIMITS.MAX_OPERATIONS_PER_BATCH` per call and
   `MAX_TOTAL_OPERATIONS` per job; iterations capped by
   `MAX_PLANNING_ITERATIONS`.
9. **Apply operations only through M04's `applyOperation`** — one call
   per proposed operation, individually idempotency-keyed
   (`${jobId}:a{attempt}:i{iteration}:op{index}`, attempt-scoped so a
   re-proposed batch after a crash can never collide with a
   partially-applied prior attempt's keys), **always** with
   `confirmDestructive: false` (see "Destructive confirmation" below). A
   destructive or semantically-invalid operation is skipped and recorded
   as `rejected` on the batch row; the rest of the batch still proceeds.
   A `StaleVersionError` (a human edited the spec concurrently) aborts
   the whole job with `stale_base_version`.
10. **Validate the complete resulting specification** —
    `validateSpecification()` re-run once more over the final accumulated
    spec as a defense-in-depth safety net, even though every individual
    M04 operation already validates internally.
11. **Create the M06 preview** — `requestPreviewBuild()`, already
    idempotent and safe to call once per job.
12. **Persist and transition to `ready`** — only after a real
    `preview_builds` row with `status: "succeeded"` exists;
    `resultingVersionNumber`/`resultingVersionId`/`resultingPreviewBuildId`
    are stamped from what was actually persisted, never from what the
    model claimed.

At every phase boundary (and via periodic heartbeat calls made mid-phase,
after each provider call) the pipeline re-checks
`cancelRequestedAt`/lease ownership and stops cooperatively — see "Worker
execution" below.

### Destructive confirmation

The model has **no field, anywhere in `@asafarim/appbuilder-ai`'s
schemas, through which it can self-approve a destructive change** —
`ProposedOperation` carries only `{ operation, modelBelievesDestructive }`
(the latter a self-reported claim used only to flag a model/engine
disagreement as a planning anomaly, never trusted). The pipeline always
calls `applyOperation(..., { confirmDestructive: false })` — hardcoded,
not sourced from anywhere in the batch. A destructive change proposed by
the model is therefore always rejected by M04's own
`DestructiveConfirmationRequiredError`, recorded as a rejected item in
that iteration's batch, and never applied. Destructive confirmation
remains exclusively a separate, explicit, human action through M04's
existing UI/API surface — outside this pipeline entirely.

## Clarification flow

`ClarificationState`/`ClarificationRound`/`ClarificationAnswer`
(`@asafarim/appbuilder-ai`) persist the full question/answer history
across every round — never overwritten, only appended.
`submitClarificationAnswers()` (`lib/repositories/generationJobs.ts`)
validates that every submitted `questionId` belongs to the job's current
round, resumes `needs_clarification -> analyzing`, and clears the lease
so the job is immediately re-claimable. `POST
/api/apps/{appId}/generation-jobs/{jobId}/clarification` is the HTTP
surface (gated by `app.requestGeneration`, editor+); the app detail
page's `GenerationStatusPanel` client component renders open questions as
a small form. This is intentionally the entire M08 conversational
surface this milestone builds — no chat history, no free-form follow-up,
no visual builder.

## Worker execution (`worker.ts`, `lib/server/queue.ts`)

A standalone process — never run inside the Next.js server — mirrors
`apps/vionto`'s existing worker/BullMQ pattern. `pnpm --filter
@asafarim/appbuilder worker:dev` runs `tsup --watch` and reruns the
bundled `worker-dist/worker.js` on every change; production builds the
identical bundle via `worker:build`, containerized by a dedicated
`worker` Docker stage. The dev script deliberately does **not** run
`worker.ts` directly via plain `tsx`: this file transitively imports
`.tsx` components from `@asafarim/appbuilder-runtime` and `@asafarim/ui`
(through `requestPreviewBuild`'s `renderPreview` call), and `tsx`'s
per-file JSX-transform resolution does not reliably apply the automatic
JSX runtime across package boundaries outside a real bundler — it
produces `ReferenceError: React is not defined` at render time for a
plain `tsx worker.ts` run. `tsconfig.worker.json` (jsx: `"react-jsx"`,
overriding the app's own Next-oriented `jsx: "preserve"`) plus tsup's
bundling together avoid this; dev and prod always run the same bundled
artifact for exactly this reason.

- **Transport, not source of truth.** BullMQ (`appbuilder-generation`
  queue on the platform's shared Redis) is a low-latency wake-up signal
  only. The durable source of truth for status, idempotency, and crash
  recovery is entirely `generation_jobs` in Postgres — a lost or
  never-delivered BullMQ message never causes a job to be silently
  dropped.
- **Atomic claiming.** `claimJobById`/`claimNextAvailableJob`
  (`lib/repositories/generationJobs.ts`) use
  `SELECT ... FOR UPDATE SKIP LOCKED` inside a transaction: two workers
  racing on the same job never both succeed — one gets the row lock, the
  other's `SKIP LOCKED` read sees nothing.
- **Bounded concurrency.** `APPBUILDER_WORKER_CONCURRENCY` (default 2)
  configures the BullMQ `Worker`'s own concurrency.
- **Lease + heartbeat.** A claim stamps `leaseOwner`/`leaseExpiresAt`
  (`GENERATION_LIMITS.DEFAULT_LEASE_DURATION_MS`, 120s) and
  `attemptCount += 1`. The pipeline refreshes the lease via `heartbeat()`
  at each phase boundary and after each provider call; a heartbeat that
  finds the lease no longer owned by this worker throws `LeaseLostError`,
  which the pipeline treats as "stop immediately, another worker owns
  this now" — never a job failure.
- **Stale-lease recovery / crash recovery.** A periodic sweep
  (`claimNextAvailableJob`, every `STALE_LEASE_SWEEP_INTERVAL_MS` = 60s)
  claims any non-terminal, non-`needs_clarification` job whose lease is
  null or expired — recovers jobs whose worker died mid-processing and
  jobs that never received a BullMQ dispatch message at all.
- **Safe retry with backoff + jitter.** A retryable classified failure
  (`lib/generation/errors.ts#RETRYABLE_FAILURE_CODES`: provider rate
  limit/unavailable, worker infrastructure error) releases the lease and
  schedules a re-dispatch via `nudgeWorker(jobId, { cause: "retry",
  attempt, delayMs })`, where `delayMs` comes from
  `computeBackoffDelayMs()` (full-jitter exponential backoff, capped at
  60s) — bounded to `GENERATION_LIMITS.MAX_JOB_ATTEMPTS` (3) before the
  job fails permanently.
- **Cooperative cancellation, tightened.** Beyond the pipeline's own
  phase-boundary checks, `worker.ts` polls the claimed job's
  `cancelRequestedAt` every 3s while processing and aborts the
  `AbortController` passed to the provider call in flight, so a real
  OpenAI request can be interrupted mid-call, not just between phases.
- **Graceful shutdown.** `SIGINT`/`SIGTERM` close the BullMQ worker
  (waits for in-flight jobs up to its own concurrency), disconnect Redis,
  close the Postgres pool, and close the health server before exiting.
- **Health check.** A plain `http.createServer` on
  `APPBUILDER_WORKER_HEALTH_PORT` (default 3008) reports `{ ok, checks:
  { worker, redis, database }, activeJobCount }` — `200` when healthy,
  `503` otherwise (including during shutdown). Not currently wired to
  Docker `HEALTHCHECK`/orchestration in `docker-compose.prod.yml` — a
  known gap, same as `vionto-worker`'s equivalent endpoint; flagged for
  M12 operational hardening.
- **No duplicate versions/previews after restart.** Guaranteed by the
  combination of: (a) the claim lease preventing two workers from
  processing the same job simultaneously, (b) every specification-mutating
  call (`applyTemplateVersion`, `applyOperation`,
  `requestPreviewBuild`) being independently idempotent, and (c) a
  restarted attempt against a partially-progressed job simply re-reading
  the **live** current specification state and continuing from there
  (re-proposing the next increment) rather than replaying stale proposed
  content — see `lib/generation/pipeline.ts`'s `applyBatchOperations` for
  the attempt-scoped per-operation idempotency keys this relies on.

## Idempotency and retry — summary table

| Step | Mechanism |
| --- | --- |
| Job enqueue | `(appId, idempotencyKey)` unique index; same key + different payload → `ConflictError` |
| Job claim | `FOR UPDATE SKIP LOCKED` + lease compare |
| Template application | Idempotency key `{jobId}:template`, gated additionally by `job.selectedTemplateId` already being set |
| Operation application | Per-operation key `{jobId}:a{attempt}:i{iteration}:op{index}` via M04's own `appliedOperations` idempotency |
| Clarification submission | Validated against the job's current open round; resuming twice with the same answers is a safe no-op re-write |
| Cancellation | Repeatable (`cancelled -> cancelled` is a no-op); a different terminal status → `ConflictError`, never silently re-activated |
| Finalization | `ready`/`failed`/`cancelled` are terminal in the state machine — no transition out exists, checked centrally |

## Cost and rate protection (`lib/generation/limits.ts`)

M07-level guardrails ahead of full M12 quota management:

- `MAX_ACTIVE_JOBS_PER_APP` = 1 — one in-flight generation per app.
- `MAX_ACTIVE_JOBS_PER_USER` = 3 — across all of a user's apps.
- `GENERATION_LIMITS.DEFAULT_LEASE_DURATION_MS` / `STALE_LEASE_SWEEP_INTERVAL_MS`
  bound how long a crashed worker's job sits unclaimed.
- `MAX_JOB_ATTEMPTS` = 3 bounds retries.
- `@asafarim/appbuilder-ai`'s `PLANNING_LIMITS` bounds prompt size,
  clarification rounds/questions, operations per batch, total operations
  per job, and planning iterations.
- Every provider call has a configured request timeout
  (`APPBUILDER_AI_REQUEST_TIMEOUT_MS`).
- Cancellation is available at any active phase.
- `generation_jobs.usage` records cumulative token counts per job — the
  input M12's quota system will consume; no billing/plan logic exists yet.

## Prompt-injection resistance

`prompts/systemPolicy.ts`'s `SYSTEM_POLICY` is composed once, server-side,
and placed in the trusted system-role message — **never concatenated
with or derived from** user input. All untrusted content (the raw
prompt, clarification answers) is wrapped via `wrapUntrustedInput()`
with explicit `BEGIN/END USER INPUT ... DATA ONLY, NOT INSTRUCTIONS`
markers in the user-role message. The policy text explicitly instructs
the model to treat embedded instruction-like text in that section as
business content only.

This is enforced structurally, not just by instruction: even a fully
successful prompt-injection attempt has no schema field to land in —
`RequirementsAnalysis` has no free-form "system prompt" or "code" field,
`OperationBatch` can only contain values from the closed `Operation`
union (no raw/custom operation type exists), and `TemplateRecommendation`
can only reference a registered template id. `fixtures/adversarial.ts`
records four concrete attempts (ignore-instructions, request code
execution, self-approve a destructive change, request secret
exfiltration) plus the well-behaved response a compliant model would
give to each — exercised by both `packages/appbuilder-ai`'s prompt-
construction unit tests and `apps/appbuilder`'s adversarial fixtures.

## Error classification (`lib/generation/errors.ts`)

`classifyGenerationError()` maps every error the pipeline can throw
(`ProviderError` from `@asafarim/appbuilder-ai`, or any of
`apps/appbuilder`'s own repository errors) onto a closed
`GenerationJobFailureCode` with a paired safe, user-facing message —
never a raw stack trace, SQL detail, or provider error string reaches
`generation_jobs.failureMessage`:

| Code | Retryable | Typical cause |
| --- | --- | --- |
| `invalid_request` | no | too many clarification rounds, malformed API input |
| `provider_configuration_error` | no | missing/invalid API key |
| `provider_rate_limit` | yes | provider 429 |
| `provider_unavailable` | yes | timeout, 5xx, connection failure |
| `malformed_provider_response` | yes | structured output didn't parse |
| `forbidden_operation` | no | model proposed a destructive change without confirmation |
| `specification_validation_failed` | no | final spec failed `validateSpecification` |
| `stale_base_version` | no | a human edited the spec concurrently |
| `authorization_lost` | no | initiating user's access was revoked |
| `preview_failed` | no | spec persisted, but M06 preview build failed |
| `worker_infrastructure_error` | yes | anything unclassified |
| `cancelled` | no | cooperative cancellation observed |

## Prompt and log safety

Persisted (by design, on `generation_jobs`/`generation_operation_batches`):
original prompt (via the linked `creation_requests` row, M05), clarification
answers, normalized requirements, operation-batch reasoning summaries,
safe failure messages, and provider usage metadata (token/latency counts,
provider/model name).

Never logged or persisted: API keys, cookies, authorization headers, raw
database URLs, full session objects, hidden provider reasoning, or
secrets detected in prompts. `@asafarim/appbuilder-ai`'s
`redact/redactForLogging`/`redactSecrets` provide a denylist-by-key plus
pattern-based redaction layer (OpenAI/Anthropic-style keys, `Bearer`
tokens, Postgres/Redis connection strings, generic `key=`/`token=`
patterns) for anything a caller is about to log or persist as a
diagnostic — applied defensively, not assumed already-clean upstream.

**Retention**: nothing in M07 currently expires or redacts data after the
fact — every `generation_jobs`/`generation_operation_batches` row is kept
indefinitely, same as every other AppBuilder table. Hardening retention
(TTLs, anonymization after N days, prompt truncation policy) is explicitly
deferred to M12.

## Local fake-provider workflow

`APPBUILDER_AI_PROVIDER=fake` (the default in `.env.example`) requires no
API key, no network access, and produces fully deterministic behavior via
`DefaultFakeProvider`. Run locally with:

```bash
docker compose up -d appbuilder-postgres redis
pnpm --filter @asafarim/appbuilder db:migrate
pnpm --filter @asafarim/appbuilder dev        # Next.js app, port 3006
pnpm --filter @asafarim/appbuilder worker:dev # bundled worker, health on :3008
```

Then create an app at `/apps/new` with a prompt containing "construction"/
"crew" (routes to the task-manager fixture) or "crm"/"deal" (routes to the
CRM fixture); any other prompt falls back to a safe blank-template
scenario. The Playwright suite (`tests/e2e/specs/ai-generation.spec.ts`)
starts this exact worker configuration itself via `playwright.config.ts`'s
`webServer` array — no manual setup needed for `pnpm e2e`.

## Optional real-provider smoke test

Not implemented as a script in this milestone (explicitly opt-in, CI-excluded,
cost-reporting tooling is deferred). To manually verify against a real
OpenAI account: set `APPBUILDER_AI_PROVIDER=openai` and
`APPBUILDER_AI_OPENAI_API_KEY`/`OPENAI_API_KEY` locally, run the worker,
and create an app through the normal UI — this will make real, billable
API calls. Never do this in CI or with the fake-provider fixtures test
suite; `apps/appbuilder`'s automated tests never require a real key (see
`vitest.config.ts`/`vitest.integration.config.ts` — neither reads
`OPENAI_API_KEY`).

## Explicit deferrals

- **M08** (builder workspace, conversational changes, selection context,
  version history, the full chat-style clarification UI): only the
  minimal single-round-at-a-time clarification form described above ships
  now.
- **M09** (generated-app end-user RBAC execution): `requiredRoleIds` on
  generated pages/nav remains unenforced by the M06 preview renderer, as
  before — M07 does not change this.
- **M10** (validation/approval gates): untouched; `app.validate`/
  `app.approve` capabilities remain defined but uncalled.
- **M12** (quotas/billing, retention hardening, worker health-check
  wiring into orchestration, cost dashboards/alerting): usage metadata is
  recorded so M12 has something to build on, but no plan/billing/quota
  enforcement, retention policy, or dashboard exists yet.
- Autonomous multi-agent workflows, arbitrary source-code generation,
  arbitrary tools, web browsing, embeddings/vector search, preview
  element selection, generated-record CRUD, automatic QA repair loops,
  production deployment, and custom domains: none implemented, per the
  issue's explicit scope boundary.

## Known gaps carried forward

- The worker's health endpoint (`:3008`) is not wired into
  `docker-compose.prod.yml`'s `HEALTHCHECK`/`depends_on: condition:
  service_healthy` — same state as `vionto-worker`'s equivalent endpoint.
- `.env.production` (the real, encrypted-at-rest production secrets file)
  was **not** modified by this milestone — an operator must add
  `APPBUILDER_AI_PROVIDER`/`APPBUILDER_AI_OPENAI_API_KEY` (or rely on the
  shared `OPENAI_API_KEY` fallback) there before flipping
  `docker-compose.prod.yml`'s `appbuilder-worker` service off the
  `fake` default — see `.env.production.example` for the documented shape.
- AppBuilder's own Next.js app service is still not deployed to
  production (ships in M11) — `appbuilder-worker` is wired ahead of that,
  same rationale as `appbuilder-migrate`, so the database and job
  lifecycle are already correct and testable ahead of that milestone.
