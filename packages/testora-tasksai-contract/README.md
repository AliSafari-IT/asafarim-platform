# `@asafarim/testora-tasksai-contract`

The versioned contract between **Testora** and **TasksAI** for the
autonomous quality loop (epic
[#269](https://github.com/AliSafari-IT/asafarim-platform/issues/269)).

No Next.js, database, auth, AI or browser dependency — just `zod` and Node's
`crypto`. Both apps import it with `"@asafarim/testora-tasksai-contract": "workspace:*"`.

## What's in here

| Module | Schemas | Used by |
|---|---|---|
| `bundle` | `RunArtifactBundle`, `TimelineStep`, `ArtifactRef` | #258, #259, #264 |
| `provision` | `ProvisionTestsRequest`/`Response`, `PendingScenarioState` | #262, #266 |
| `events` | `WebhookEnvelope`, `parseWebhookEvent`, `GreenLightData`, `TestDiagnosisProposal` | #261, #263, #264 |
| `signing` | `signPayload`, `verifySignature` (HMAC-SHA256, replay window, rotation) | every direction |
| `version` | `CONTRACT_VERSION`, `SCHEMA_VERSIONS` | all |

## Versioning

Every payload carries a numeric `v` discriminant. **Additive** changes (new
optional field, new enum member read defensively) do not bump anything.
**Breaking** changes bump the payload's `v` and `CONTRACT_VERSION`, and add
a new `z.literal(n)` branch — the old one stays until both apps have moved.

## Trust boundary

See [`docs/testora-tasksai-contract.md`](../../docs/testora-tasksai-contract.md)
and [`docs/adr/0002-testora-tasksai-trust-boundary.md`](../../docs/adr/0002-testora-tasksai-trust-boundary.md).

```bash
pnpm --filter @asafarim/testora-tasksai-contract test
pnpm --filter @asafarim/testora-tasksai-contract typecheck
```
