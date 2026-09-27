# AI Workbench — server execution boundary

Issue [#673](https://github.com/AliSafari-IT/asafarim-platform/issues/673)
(AIT-003), part of [#670](https://github.com/AliSafari-IT/asafarim-platform/issues/670).
Read the [charter](./charter.md) for the product rules this enforces.

Every public tool runs through one server-only path. The browser never
talks to an AI provider, and a tool can't bypass validation, kill switches,
spend limits, or cost recording.

```
browser ── POST /api/tools/<slug>/run ──▶ executeTool()
            { input, idempotencyKey,          │
              mode: example | live }          ├─ adapter (per tool): schemas, fixture, prompt
                                              ├─ LiveProvider (Anthropic SDK)
                                              ├─ IdempotencyStore (in memory)
                                              └─ CostEventSink (WebToolCostEvent, platform DB)
```

## Files

| File | Role |
|---|---|
| `apps/web/lib/tools/envelope.ts` | Wire contract: request, result envelope, public error codes and messages. Client-safe. |
| `apps/web/lib/tools/server-runner.ts` | Browser runner: one idempotency key per run, one retry on network failure, maps the envelope to UI states. |
| `apps/web/app/api/tools/[slug]/run/route.ts` | Route handler: body cap, JSON parse, wires the dependencies. |
| `apps/web/lib/tools/server/execute.ts` | The execution order below. |
| `apps/web/lib/tools/server/adapter.ts` | The `ToolAdapter` contract each tool implements. |
| `apps/web/lib/tools/server/adapters/` | One adapter per tool, plus the closed slug → adapter map. |
| `apps/web/lib/tools/server/config.ts` | Mode, kill switches, provider key and model. Fails closed. |
| `apps/web/lib/tools/server/providers/anthropic.ts` | Anthropic Messages via `@anthropic-ai/sdk`. |
| `apps/web/lib/tools/server/idempotency.ts` | Duplicate-submission guard. |
| `apps/web/lib/tools/server/cost.ts`, `cost-sink.ts`, `pricing.ts` | Cost events (ADR 0003), price table, persistence. |
| `apps/web/lib/tools/server/log.ts` | The only logger: typed, allowlisted fields. |

Every file under `lib/tools/server/` starts with `import "server-only"`. A
test checks this, and also checks that no `"use client"` file imports the
server boundary or the provider SDK.

## Execution order

| # | Step | On failure | Spend |
|---|---|---|---|
| 1 | Body ≤ 64 KB, valid JSON, `{ input, idempotencyKey, mode }` shape | `input_too_large` / `invalid_request` | none |
| 2 | Tool exists and is routable, adapter registered | `tool_not_found` | none |
| 3 | Serialized input ≤ `maxInputBytes`, then the adapter's input schema | `input_too_large` / `invalid_input` | none |
| 4 | `mode: "example"`: must equal the catalogue example; served from the fixture | `invalid_request` | none |
| 5 | Tool paused (lifecycle or Admin list) | `tool_paused` | none |
| 6 | `AI_TOOLS_MODE=fixture`: served from the adapter's fixture | — | none |
| 7 | Live off, no key, no live spec, or catalogue `liveGeneration: false` | `provider_disabled` | none |
| 8 | Admission hook: rate limit or quota (#680) | `rate_limited` / `quota_exceeded` | none |
| 9 | Idempotency (see below) | `idempotency_conflict` | none |
| 10 | Worst-case cost ≤ `maxEstimatedCostMicros`, model is priced | `provider_disabled` (logged) | none |
| 11 | Provider call, aborted at `timeoutMs` or when the client disconnects | `timeout` / `provider_error` / `internal` | yes |
| 12 | Cost event written | logged; the result is still returned | — |
| 13 | Refusal / `max_tokens` / output size / JSON / `live.toOutput` / output schema | `declined` / `invalid_output` | already spent |

Unvalidated model output is never returned. `invalid_output` carries no
fragment of what the model said.

**Domain checks and partial results.** A tool's `live.toOutput(input, json)`
turns the provider's JSON into the tool's output. It can:

- assign ids and attach source text;
- drop individual items that fail domain rules, such as a test scenario
  citing text that isn't in the input, or an action-plan task that assigns a
  person or adds a deadline the notes don't contain;
- repair structure, such as dropping dependency links to unknown tasks or
  links that would close a cycle (surfaced to the user as an open question);
- return `null` to reject the whole result.

If it drops anything, the run comes back as `status: "degraded"`, with the
UI-safe notes it returned as `warnings`. The cost event is recorded with
`outcome: degraded`, and the UI shows the result as a partial one with those
notes.

## Modes and kill switches

| Control | Where | Effect |
|---|---|---|
| `AI_TOOLS_MODE` | env | `off` (default): examples only. `fixture`: every run uses the fixture (dev, CI, E2E; no key needed). `live`: provider calls allowed. An unknown value is treated as `off`. |
| `AI_TOOLS_KILL_SWITCH=1` | env | Stops all live calls without touching the database. |
| `web.aiTools.liveEnabled` | Admin → Settings | Global live switch, **off by default**. If settings can't be read, live stays off. |
| `web.aiTools.disabledTools` | Admin → Settings | Pauses the listed tools' live runs (`tool_paused`); their pages and examples stay up. |
| `AI_TOOLS_PROVIDER` | env | Only `anthropic`; anything else fails closed. |
| `AI_TOOLS_ANTHROPIC_MODEL` | env | Defaults to `claude-opus-5`. It must be in `pricing.ts`, or live runs are refused as unpriced. |
| Anthropic key | Admin `ai.anthropic.apiKey`, else `ANTHROPIC_API_KEY` | Without a key, live stays off. |

Examples and explanatory pages keep working under every combination.

**Emergency stop:** set `web.aiTools.liveEnabled` off in Admin (takes effect
on the next run). If the database or Admin is unavailable, set
`AI_TOOLS_KILL_SWITCH=1` and restart the web container.

## Error codes

`envelope.ts` holds the UI-safe message and HTTP status for each code. Only
`rate_limited`, `in_progress`, `timeout`, and `provider_error` are marked
retryable, and the UI never retries a paid run automatically.

| Code | HTTP | Meaning |
|---|---|---|
| `invalid_request` | 400 | Malformed body, bad idempotency key, or `example` mode with non-example input |
| `invalid_input` | 422 | Failed the tool's input schema (`issues` holds UI-safe messages) |
| `input_too_large` | 413 | Over the body or `maxInputBytes` cap |
| `tool_not_found` | 404 | Unknown slug, or an internal tool in production |
| `provider_disabled` | 503 | Live is off, unconfigured, or over the cost ceiling |
| `tool_paused` | 503 | Paused by lifecycle or Admin |
| `rate_limited` / `quota_exceeded` | 429 | Admission hook (#680) |
| `idempotency_conflict` | 409 | Key reused for different input |
| `timeout` | 504 | Provider call exceeded `timeoutMs` |
| `provider_error` | 502 | Provider unavailable or rate-limited us |
| `declined` | 422 | The model refused (after server-side fallback) |
| `invalid_output` | 502 | Truncated, oversized, non-JSON, or schema-invalid output |
| `internal` | 500 | Configuration or unexpected failure |

## Idempotency

The browser mints one key per run (`crypto.randomUUID()`) and reuses it for
its single network retry. The server keys entries on `<slug>:<key>`, with a
SHA-256 hash of the input:

- **Duplicate while the first run is in flight:** the duplicate waits for
  the same call. One spend.
- **Duplicate within 2 minutes of a finished run:** the same envelope is
  returned. No new call.
- **Same key, different input:** `idempotency_conflict`.
- **Retryable failures** (timeout, provider error) free the key, so a user's
  retry really runs again.

The store is in process memory and holds the envelope, including the result,
for at most 2 minutes. That lets a browser that lost the response get it back
without paying twice. It never touches disk, logs, or a shared cache. It is
per-instance: the web container runs one replica. Scaling out needs a shared
store; that belongs with #680.

## Cost events

Each live attempt that reached, or may have reached, the provider writes one
`WebToolCostEvent` row (the platform DB, append-only by trigger), following
`@asafarim/ai-cost-ledger`:

- **Owner:** `ownerType: workspace`, `ownerId: web-public-tools`,
  `actorId: null`. No visitor identifier is stored.
- **Operation:** the tool slug. `subjectType: public_tool_run`,
  `subjectId: <run id>`, `idempotencyKey: web:<slug>:<run id>`.
- **Cost:** `registry_estimate` from the `pricing.ts` snapshot, priced on
  the model that actually answered (which can differ after a refusal
  fallback). A timeout or client abort gives `costSource: unknown`,
  `outcome: cancelled`, and no amount.
- **Outcome:** a refusal or invalid output is `failed`, with its billed
  usage.
- **Not recorded:** provider rejections that aren't billed (auth, 4xx, 429,
  5xx before generation) and fixture runs.
- **Reconciliation:** Admin reads the table as the `web` source
  (`apps/admin/lib/server/ai-cost-reconciliation/internal-sources.ts`).

## Logging

`consoleToolLogger` emits one JSON line per run:

- slug, tool version, requested and served mode, outcome code;
- duration, whether the result was replayed, the model, whether the fallback
  was used, and whether a cost event was recorded.

`tool_config` lines carry operator notes, such as "live disabled" or
"unpriced model". The logger's types allow nothing else. Input, output,
prompts, keys, and provider error bodies can't be passed to it. A test checks
that none appear.

## Adding a live tool

See [adding-a-tool.md](./adding-a-tool.md). In short, write an adapter with:

- the input and output Zod schemas;
- a deterministic `fixture` and `exampleInput`;
- `limits`, including `maxEstimatedCostMicros`;
- a `live` spec with a `promptVersion`, a JSON Schema for structured output,
  and `buildPrompt`.

`buildPrompt` fences the user's text as data in the user turn, never in the
system prompt. Then register the adapter in `adapters/index.ts`. Set
`liveGeneration: true` in the catalogue only once the tool passes its eval
gate (#679).

## Deferred

- **Rate limits, daily spend ceiling, threat model** (#680). The
  `admit` hook is where they plug in.
- **Provider fallback across vendors.** `LiveProvider` is the seam; not
  needed for MVP.
