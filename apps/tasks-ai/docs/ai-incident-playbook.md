# TasksAI — AI incident playbook (M06)

Scope: anything where the AI subsystem misbehaves — bad proposals at scale,
runaway spend, a suspected prompt-injection breach, provider outage, or a
data-handling concern.

## Severity & first action

| Symptom | First action (seconds) |
|---|---|
| Runaway spend / cost spike | `PATCH /workspaces/{slug}/ai/settings { "monthlyBudgetUsd": 0 }` for the affected workspace, or set the fleet default in `AiSettings` seed. `GET .../ai/usage` to see the month. |
| Bad/unsafe proposals reported | `PATCH .../ai/settings { "enabled": false }` — kill switch. Core task management is unaffected. |
| Suspected prompt-injection breach | Kill switch on. Pull `auditEvent` rows `name="proposal.generated"` for the window; each has `provider`, `promptVersion`, `redactionCounts`, `opCount`, `groundedRatio`. Proposals are `draft` until a human applies — check for any `proposal.applied` in the window. |
| Provider outage | No action needed — jobs auto-fall-back to the fixture provider and are marked `degraded`. Optionally `PATCH .../ai/settings { "provider": "fixture" }` to skip the retry latency. |
| Data-handling concern (PII to provider) | Kill switch. `lib/ai/redact.ts` is the control; add a rule + a `redact.test.ts` case, ship, re-enable. |

## Investigate

1. **Scope it.** `AiJob` rows by `workspaceId` + window: `state`, `provider`, `promptVersion`, `costUsd`, `latencyMs`.
2. **Reproduce offline.** `AI_EVAL_PROVIDER=fixture pnpm --filter @asafarim/tasks-ai ai:eval`, add the failing input as an `evals/cases.ts` case.
3. **Reconcile spend.** `AiUsageLedger` sum for the window vs. the provider's own dashboard. Discrepancy → a job wrote a ledger row but the provider bill differs → check the price table in the adapter.
4. **Check blast radius.** `Proposal.operations` length vs `AiSettings.maxBlastRadius`. If a large proposal slipped through, the guard has a bug — add a `guard.test.ts` case.

## Recover

- Bump the prompt version (e.g. `extract_plan@2`) with the fix; old jobs stay attributable to `@1`.
- Re-enable per workspace after the eval set is green again.
- If any `proposal.applied` caused bad writes: `POST .../ai/proposals/{id}/undo` replays the inverse plan.
- Post-incident: record the cause, the guard/redaction/prompt change, and the new eval case in this repo.

## Owners

AI subsystem: Ali Safari / ASafarIM. Escalation for spend: same. Legal/data:
see `docs/compliance/decisions.md`.
