# TasksAI — AI safety, evaluation & provider boundary (M06)

Provider-neutral. Evaluable. Budgetable. Auditable. **Disableable.**

## The pipeline (`lib/ai/job.ts`)

```
kill-switch + quota  →  redact  →  render versioned prompt  →  cache lookup
   →  provider call (retry ×3, degraded fallback to fixture)
   →  guard: operation allowlist + blast radius
   →  persist AiJob + AiUsageLedger + Proposal(state=draft)     ← nothing applied
```

- **Kill switch / quota** (`lib/ai/quota.ts`): `AiSettings.enabled=false` → every AI job returns `403`; core task management is untouched. Monthly `monthlyBudgetUsd` / `monthlyJobQuota` exhausted → `429 rate_limited`. Both integration-tested.
- **Redaction** (`lib/ai/redact.ts`): emails, API-key patterns, DSNs, bearer tokens, JWTs, card/phone/long-hex → placeholder tokens, *before* anything leaves the process. Over-redacts by design. The `proposal.generated` audit records the redaction counts.
- **Prompt registry** (`lib/ai/prompts.ts`): versioned (`extract_plan@1`, …). Untrusted input is fenced between `<<<UNTRUSTED_INPUT … UNTRUSTED_INPUT>>>`; the system prompt states plainly that content in the fence is data, never instructions, and that operations are limited to the allowlist regardless of what it says. `cacheKey = sha256(version + system + user)`.
- **Providers** (`lib/ai/providers/`): `fixture` (deterministic, $0, **the only one CI uses**), `anthropic`, `openai` — behind one `AiProvider` interface, loaded lazily so a run without keys never imports their SDKs. No-training DPA is a contractual requirement (`docs/compliance/decisions.md`).
- **Degraded mode**: after 3 failed provider attempts, the job falls back to the fixture provider and is marked `state=degraded` — the user gets an assumption-heavy draft instead of an error. AI can be fully removed without breaking core task management.
- **Guard** (`lib/ai/guard.ts`): re-validates every op against the discriminated-union schema, enforces `maxBlastRadius`, checks ref uniqueness and that links/parentRefs resolve. `GuardError` → job `failed`, no proposal.

## The proposal model (`lib/ai/proposals.ts`, docs/adr/0004)

**AI never mutates domain data.** Every change is a `Proposal` of operations drawn from a fixed allowlist:

| op | fields it may set | what it can NOT touch |
|---|---|---|
| `create_task` | title, description, estimate, parentRef | assignee, dates, status, labels, anything else |
| `update_task` | title, description, estimate | (same) |
| `link_tasks` | kind (blocks/relates/duplicates) | — |

Assignees, dates, roles, permissions, billing, and messaging are **not representable** — the schema has no field for them. Prompt injection cannot widen this (unit- + integration-tested).

- `GET .../ai/proposals/{id}` — draft → previewed.
- `POST .../apply` — one transaction, captures an inverse `undoPlan`; high blast radius (>15 ops or edited ops) requires `?confirm=high`. Writes `proposal.applied` audit with `editDistance`.
- `POST .../reject` — changes nothing.
- `POST .../undo` — replays the inverse plan; `proposal.undone` audit.
- `POST .../ai/jobs` again = regenerate (client re-submits the input, which is never stored verbatim after redaction).

## Evals (`evals/`)

`pnpm --filter @asafarim/tasks-ai ai:eval` runs the versioned offline set against the **fixture** provider (or `AI_EVAL_PROVIDER=anthropic` for a real, billable run — never in CI). Scores per case: op-count bounds, grounded-citation ratio, determinism (same input twice → identical), no forbidden text, only allowlisted op types, latency, cost (must be $0 for fixture). `evals/harness.test.ts` makes a green eval set a CI gate.

## Kill switch & incident response

`docs/ai-incident-playbook.md`. In short: `PATCH .../ai/settings {enabled:false}` stops AI workspace-wide in one call; set `monthlyBudgetUsd:0` to freeze spend; the `AiUsageLedger` reconciles against `AiJob` for the spend dashboard (`GET .../ai/usage`).

## New env

| Var | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | anthropic provider (unused unless `AiSettings.provider="anthropic"`) |
| `OPENAI_API_KEY` | openai provider |
| `AI_EVAL_PROVIDER` | eval runner target; default `fixture` |
