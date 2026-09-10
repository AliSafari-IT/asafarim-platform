# Testora ↔ TasksAI contract & trust boundary

Companion to [ADR 0002](adr/0002-testora-tasksai-trust-boundary.md). This is
the working reference for anyone implementing an issue in epic
[#269](https://github.com/AliSafari-IT/asafarim-platform/issues/269).

The schemas and signing helpers described here are the shipped source of
truth in [`@asafarim/testora-tasksai-contract`](../packages/testora-tasksai-contract).

---

## 1. Topology

```
                 service token (bundle read)
   TasksAI  ───────────────────────────────────▶  Testora
      ▲                                              │
      │            signed webhooks (HMAC)            │
      │   regression.detected / flake.detected  ◀────┤   Testora → TasksAI
      │                                              │
      ├──  provision request (signed)  ─────────────▶│   TasksAI → Testora
      │                                              │
      └──  greenlight.reached callback (signed)  ◀───┘   Testora → TasksAI
```

Two isolated databases, two auth systems. Nothing shared except this
contract package and the two secrets below.

## 2. Secrets

| Secret | Held by | Purpose |
|---|---|---|
| `TESTORA_TASKSAI_WEBHOOK_SECRET` | both | HMAC key for every webhook, both directions. Rotatable (array of valid values during rotation). |
| `TESTORA_BUNDLE_READ_TOKEN` | TasksAI (sender), Testora (verifier) | bearer token for `GET` of an artifact bundle |

Never logged, never echoed in errors, never placed in a URL query string.

## 3. Signing

Implemented by `signPayload` / `verifySignature` in the contract package.

Signed material: `` `${timestamp}.${deliveryId}.${rawBody}` ``

Headers on every delivery:

| Header | Value |
|---|---|
| `x-asafarim-signature` | `sha256=<hex>` |
| `x-asafarim-delivery` | UUID, unique per attempt |
| `x-asafarim-timestamp` | unix seconds |

Receiver rules:

1. Reject if any of the three is missing.
2. Reject if `|now - timestamp| > 300s` (replay window).
3. Recompute the HMAC for each currently-valid secret; constant-time
   compare. Reject on no match.
4. Optionally de-dupe on `x-asafarim-delivery` for at-most-once side
   effects.

## 4. Payloads

All zod, all in the contract package, all with a numeric `v`.

| Payload | Schema | Direction | Issue |
|---|---|---|---|
| Run-artifact bundle | `RunArtifactBundle` | Testora → TasksAI (read) | #258 / #259 |
| Provision request | `ProvisionTestsRequest` | TasksAI → Testora | #262 / #266 |
| Provision response | `ProvisionTestsResponse` | Testora → TasksAI (sync) | #262 |
| Webhook envelope | `WebhookEnvelope` + `parseWebhookEvent` | both | #261 |
| — `regression.detected` | `RegressionDetectedData` | Testora → TasksAI | #261 / #264 |
| — `flake.detected` | `FlakeDetectedData` | Testora → TasksAI | #260 / #261 |
| — `run.completed` | `RunCompletedData` | Testora → TasksAI | #261 |
| — `check.updated` | `CheckUpdatedData` | Testora → TasksAI | #262 |
| — `greenlight.reached` | `GreenLightData` | Testora → TasksAI | #263 / #265 |
| Diagnosis proposal | `TestDiagnosisProposal` | TasksAI internal (AI kind) | #264 |

### Data minimisation, enforced

- Every payload schema is `.strict()` — an unknown key fails validation.
  This is the mechanical guarantee that Testora cannot leak application
  source into a bundle and TasksAI cannot leak task PII into a provision
  request.
- `RunArtifactBundle` carries **pointers** to artifacts (signed,
  short-lived storage URLs), never inlined bytes and never file contents.
- `ProvisionTestsRequest` carries **opaque refs** (`taskRef`, `checkRef`,
  `criterion.ref`) — Testora stores them as strings and echoes them back;
  it never resolves them against TasksAI.

## 5. Versioning rules

- **Additive** (new optional field; new enum member consumed with a
  default/fallback branch): no version bump. Ship it.
- **Breaking** (remove/rename a field; tighten a type; change a meaning):
  - add `z.literal(n+1)` as a new discriminated branch,
  - bump `CONTRACT_VERSION`,
  - migrate each consumer in its own PR,
  - retire the old branch only after both apps no longer emit it.
- A consumer that receives a `v` it does not understand **skips** the
  delivery (logs + 2xx so the sender does not retry forever) — it never
  crashes.

## 6. Failure modes

| Situation | Behaviour |
|---|---|
| Testora down when TasksAI provisions | request queued/retried; `TaskCheck` stays `pending`; task just isn't auto-completable |
| Testora down when it would send a webhook | outbox ret/backoff (Testora's dispatcher, #261); no data lost |
| TasksAI AI disabled / degraded | `regression.detected` still creates a **deterministic templated task**, no proposal |
| Duplicate webhook delivery | consumer de-dupes on `deliveryId`; side effects at-most-once |
| Event loop (webhook triggers provision triggers webhook…) | `causationId` propagated; per-source rate limit; automations-engine loop guard trips |
| Unknown `v` | delivery skipped, 2xx returned, logged |

## 7. Out of scope (hard guardrails)

- No auto-merge of any branch.
- No auto-close / auto-complete of a task without a human. The green-light
  gate **blocks** completion; a human still completes it, and an admin
  override is audited.
- Testora never writes to a repository.
