# ADR 0003: Append-only, vendor-neutral AI cost-event contract

**Status:** Accepted
**Date:** 2026-09-24
**Related:** Milestone [#31 — AI Cost Ledger & User Cost Timelines](https://github.com/AliSafari-IT/asafarim-platform/milestone/31), [#585](https://github.com/AliSafari-IT/asafarim-platform/issues/585) (this contract), #586/#587 (ResuMatch), #588/#589 (Vionto), #590/#591 (TasksAI), #592 (reconciliation)
**Package:** [`@asafarim/ai-cost-ledger`](../../packages/ai-cost-ledger)

## Context

ResuMatch, Vionto and TasksAI all call paid AI providers and all meter it,
but their rows cannot answer the same product question — *what did this
job / video / task cost in AI provider spend?*

| App | Today | Gap |
|---|---|---|
| ResuMatch | `AiUsageLedger` — `kind/provider/model/inputTokens/outputTokens/costUsd Float` | no job/application link; float money |
| Vionto | `ViontoAiClip` — `estimatedCostUsdMicros`, `costSource`, `credentialSource`, `pricingSnapshot` | only AI-motion clips; exports don't record which costs they consumed |
| TasksAI | `AiJob.costUsd` + `AiUsageLedger.costUsd` floats | no project/task allocation; job cost duplicated across two tables |

ResuMatch and TasksAI deliberately run **isolated databases**; Vionto lives
in the platform database. So what we need is a shared **contract**, not a
shared table.

## Decision

Each app persists an `ai_cost_event` table in its own schema whose columns
map 1:1 onto `CostEventWrite` in `@asafarim/ai-cost-ledger`. The package
owns validation, money arithmetic, usage normalization, pricing snapshots,
effective-cost resolution, aggregation and the timeline read-model DTOs.
It has no database, framework or AI SDK dependency.

### 1. Append-only, idempotent

- A row is **inserted once and never updated**. No `UPDATE` path exists in
  any app's repository code for this table.
- Every row carries an `idempotencyKey` with a **database-enforced unique
  index** (per app DB). Writers insert with `ON CONFLICT (idempotency_key)
  DO NOTHING` (Prisma: `createMany({ skipDuplicates: true })`), so a retried
  write — a request retry, a worker redelivery, a double-click — is a no-op.
- Key recipe: `buildIdempotencyKey(app, operation, <stable id>)` where the
  stable id is the provider request id when the provider returns one, else
  an id minted **once per logical call** (before the retry loop) or the
  domain row id the call produced (e.g. a Vionto clip id, a TasksAI job id).
- Corrections are **new rows**: `entryType: "adjustment"`,
  `costSource: "reconciled_adjustment"`, `supersedesEventId` → the corrected
  row, and a signed `adjustmentDeltaMicros`. History is never repriced.

### 2. Money

- Canonical amounts are **integer USD micros** (`BIGINT`, `1 USD = 1_000_000`),
  handled as `bigint` in TypeScript. Never binary floating point.
- `estimatedCostMicros` — registry estimate at call time.
  `actualCostMicros` — provider-billed amount, when reported.
  Both nullable; **`null` means unknown, `0` means genuinely free.**
- Sums are range-checked against the signed 64-bit range
  (`MicrosOverflowError`) rather than wrapping.
- Display uses 2–4 fraction digits so sub-cent calls never read as `$0.00`.

### 3. Pricing snapshot

`pricingSnapshot` stores the exact rate card (table version, provider,
matched model pattern, tier, per-bucket rates as integer-micro strings)
used for the estimate. Each app owns its price table
(`createPricingRegistry(version, entries)`); bumping the table's version
string is how a price change is recorded. If any used bucket has no rate,
the estimate is **unknown** — never a partial sum.

### 4. Usage buckets are mutually exclusive

`input | cached_input | cache_write_input | output | reasoning_output |
audio_input | audio_output | image_input | image_output | video_output |
tts_output | tool_call | request`, each with a unit
(`tokens | characters | seconds | images | calls | requests`).

Provider counts are normalized **before persistence**:
OpenAI's `prompt_tokens` includes `cached_tokens` and `completion_tokens`
includes `reasoning_tokens`, so the helpers subtract them
(`normalizeOpenAiUsage`). Anthropic's `input_tokens` already excludes cache
reads/writes (`normalizeAnthropicUsage`). A duplicated bucket on a write
is a validation error.

### 5. Cost source and credential/payer

| `costSource` | Meaning | Amount rule |
|---|---|---|
| `provider_reported` | the provider's response/API gave the billed amount | `actualCostMicros` required |
| `registry_estimate` | computed from the app's price table | `estimatedCostMicros` + `pricingSnapshot` required |
| `reconciled_adjustment` | reconciliation delta (#592) | adjustment rows only |
| `unknown` | usage happened, cost not determinable | both amounts **must** be null |

`credentialSource`: `platform` (our key), `user_byok` (the user's own key —
shown as *estimated provider cost*, never *platform spend*), `none`
(fixture/deterministic).

`fixture: true` rows are a known **$0** with `credentialSource: "none"`.

### 6. Effective cost

`actual ?? estimated`, fixtures are `0`, otherwise unknown. Totals report
`effectiveKnownMicros` **plus** `unknownCount` and coverage
(`knownCount / eventCount`, basis points). Adjustments add their delta to
amounts but not to counts. An empty period has coverage `null` ("no
data"), not 100 %.

### 7. Lifecycle / status

- `outcome`: `succeeded | degraded | failed | cancelled`. A `failed` or
  `cancelled` event is only written when the provider reported billable
  usage for it; a call that never reached the provider writes nothing.
- `finality`: `provisional` (the app's own per-response figure) → a later
  reconciliation **adjustment** row with `finality: "final"`. The original
  row is never flipped in place.

```
provider call ──► usage row (provisional) ──► [reconciliation] ──► adjustment row (final, Δ)
                         ▲ retry / redelivery hits unique idempotencyKey → no-op
```

### 8. Attribution

`subjectType/subjectId` is the most specific **durable** entity the cost
served; `parentSubjectType/Id` is the next level up; `workflowId` groups
separate line items of one user action; `traceId` is an optional OTel
trace id. Attribution is written at call time and **never inferred later
from current state** (Vionto export membership, TasksAI task links).

Where one call serves many entities (a TasksAI planning run that creates
five tasks) the money is attributed **once** at the shared level and the
entities are linked through a separate *involvement* table with no amount.

### 9. Privacy boundary

The ledger holds **IDs and operational metadata only**: never prompts,
responses, CV text, job text, cover letters, task titles/descriptions,
video prompts, API keys or provider secrets. `metadata` is a ≤24-key map
of scalars with a deny-list on key names (`prompt`, `content`, `text`,
`apiKey`, `email`, …) enforced by the schema. Actor ids exist for audit and
"my activity" filters; UIs must not rank people by cost.

### 10. Retention and erasure (per data boundary)

| Boundary | Owner key | On account/workspace erasure | Retention |
|---|---|---|---|
| ResuMatch DB | `workspaceId` | rows deleted with the workspace (same cascade as `AiUsageLedger`) | life of workspace |
| Platform DB (Vionto) | `userId` | rows deleted with the user (FK `ON DELETE CASCADE`); `projectId`/`versionId`/`renderJobId` are plain columns, so deleting a project keeps its history (shown as "Deleted project"); export snapshot rows cascade with the export | life of account |
| TasksAI DB | `workspaceId` | rows deleted with the workspace; `actorMembershipId` is nulled when a member is removed so the cost stays attributable to the project without the person | life of workspace |

Deleting a *domain entity* (a job, a project, a task) does **not** delete
its cost events — spend happened. The subject id is kept as an opaque id
and the UI shows it as "deleted item".

### 11. Read model

`CostTimelineQuerySchema` + `resolveRange` + `encodeCursor/decodeCursor` +
`totalsToDTO`. Order is `(occurredAt DESC, id DESC)`; aggregation is
computed server-side over the whole filter, independent of the page, so
changing the page size never changes a total. Ranges are UTC instants; UIs
explain them in the viewer's timezone. Micros cross the wire as strings.

### Standards alignment

- **OpenTelemetry GenAI**: `provider` ≈ `gen_ai.provider.name`,
  `requestModel`/`responseModel` ≈ `gen_ai.request.model`/`gen_ai.response.model`,
  `providerRequestId` ≈ `gen_ai.response.id`, usage buckets extend
  `gen_ai.usage.input_tokens`/`output_tokens`.
- **Langfuse**: per-generation usage details with exclusive buckets and a
  cost per bucket.
- **Stripe meter events**: immutable events with a client-supplied
  identifier for dedupe; summaries computed asynchronously.
- **FOCUS**: we use its allocation vocabulary (effective vs. list cost,
  allocated vs. unallocated) but make **no** claim of FOCUS dataset
  conformance.

## Examples

**ResuMatch** — tailoring + cover letter in one preview:

```ts
{ app: "resumatch", ownerType: "workspace", ownerId: ws, actorId: userId,
  operation: "tailor", subjectType: "target_job", subjectId: jobId,
  workflowId: previewWorkflowId, provider: "openai", responseModel: "gpt-4o-mini",
  usage: [{bucket:"input",unit:"tokens",quantity:3100},{bucket:"output",unit:"tokens",quantity:900}],
  costSource: "registry_estimate", estimatedCostMicros: 1005n, pricingSnapshot, credentialSource: "platform" }
// + a second row, operation "cover_letter", same workflowId, own idempotency key
```

**Vionto** — AI-motion clip later used by an export:

```ts
{ app: "vionto", ownerType: "user", ownerId: userId, operation: "ai_motion_clip",
  subjectType: "ai_clip", subjectId: clipId, parentSubjectType: "project", parentSubjectId: projectId,
  provider: "fal", responseModel: "fal-ai/ltx-video/image-to-video",
  usage: [{bucket:"video_output",unit:"seconds",quantity:5}],
  costSource: "registry_estimate", estimatedCostMicros: 20000n, credentialSource: "user_byok" }
// export creation inserts (exportId, costEventId) join rows for the exact events it consumed
```

**TasksAI** — decomposition that creates five tasks:

```ts
{ app: "tasks-ai", ownerType: "workspace", ownerId: ws, actorId: membershipId,
  operation: "decompose", subjectType: "project", subjectId: projectId,
  workflowId: aiJobId, provider: "anthropic", responseModel: "claude-sonnet-5", ... }
// five ai_cost_involvement rows (taskId, costEventId, role "shared_run") — no amounts
```

## Consequences

- Three physically separate tables, one semantics. Cross-app views (e.g.
  admin reconciliation) read each app through its own server boundary.
- Legacy float rows stay readable and are surfaced as **legacy / partial**
  data, never silently converted to canonical figures.
- Adding a provider or model is a price-table entry and a version bump —
  no migration.
