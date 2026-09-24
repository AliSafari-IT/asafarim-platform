# `@asafarim/ai-cost-ledger`

The vendor-neutral AI provider **cost-event contract** shared by ResuMatch,
Vionto and TasksAI (milestone
[#31](https://github.com/AliSafari-IT/asafarim-platform/milestone/31),
issue [#585](https://github.com/AliSafari-IT/asafarim-platform/issues/585)).

A contract, not a database: each app stores events in its own isolated
schema. No Next.js, database, auth, AI SDK or browser dependency — just `zod`.

| Module | What |
|---|---|
| `event` | `CostEventWriteSchema` / `parseCostEventWrite`, cost/credential sources, outcomes, finality, metadata deny-list, `buildIdempotencyKey` |
| `money` | integer-micro `bigint` helpers: `usdDecimalToMicros`, `sumMicros` (overflow-checked), `multiplyRate`, `formatMicros`, `legacyUsdFloatToMicros` |
| `usage` | exclusive usage buckets + `normalizeOpenAiUsage` / `normalizeAnthropicUsage` / `simpleTokenUsage` |
| `pricing` | `createPricingRegistry`, `perMillionTokens`, `estimateCost`, `PricingSnapshotSchema` |
| `aggregate` | `effectiveCost`, `summarize`, `groupTotals`, `coverageBasisPoints`, `coverageStatus` |
| `timeline` | `CostTimelineQuerySchema`, `resolveRange`, cursor encode/decode, wire DTOs |
| `reconcile` | provider-vs-internal daily reconciliation (#592): `internalDailyLines`, `reconcile`, `collectPages`, `dedupeProviderLines`, fingerprints, statuses — see [`docs/ai-cost-reconciliation.md`](../../docs/ai-cost-reconciliation.md) |
| `provider-reports` | pure parsers for OpenAI `organization/costs` and Anthropic `cost_report` pages |

Semantics, privacy boundary, lifecycle and per-app examples:
[`docs/adr/0003-ai-cost-event-contract.md`](../../docs/adr/0003-ai-cost-event-contract.md).

## The three rules that matter most

1. **Unknown is not zero.** `null` amount = not tracked; `0n` = genuinely free (fixture).
2. **Never update a row.** Corrections are `adjustment` rows with `supersedesEventId`.
3. **Unique `idempotencyKey` in the database.** Insert with skip-duplicates.

```bash
pnpm --filter @asafarim/ai-cost-ledger test
pnpm --filter @asafarim/ai-cost-ledger typecheck
```
