# TasksAI — Focus, risk & workload intelligence (M08)

Helps a team see the next best action and delivery risk — **without becoming
a worker-surveillance system**.

## Deterministic vs. model judgment

Everything in M08 is **deterministic**. `lib/intel/scoring.ts` and
`lib/intel/signals.ts` are pure functions over a task snapshot; no model
call. Model-generated suggestions (M07 copilot) are a separate, clearly
labelled surface. Each output carries its `ruleVersion` so it is
reproducible from versioned evidence.

## Focus ranking (`lib/intel/scoring.ts`, `focus-rank@1`)

`score = Σ points`, `points = raw × weight × 100`, over six factors:

| factor | input | default weight |
|---|---|---|
| urgency | days to due date (overdue → 1.0) | 0.35 |
| impact | how many open tasks this blocks | 0.25 |
| readiness | inverse of how many block it | 0.15 |
| commitment | assigned to you? | 0.10 |
| workload | **dampener** — falls as your open count rises | 0.10 |
| freshness | days since last update | 0.05 |

`GET /workspaces/{slug}/focus` returns the ranked list **with every
factor's raw input, weight, points and a plain-English `because`**. Users
re-weight or disable a factor via `PATCH .../signal-preferences` (weight
0–2; a preference of `enabled:false` sets weight 0). Ranking is **stable**:
equal scores tie-break by task id, so the order does not jitter between
requests (unit-tested).

## Signals (`lib/intel/signals.ts`, `signals@1`)

`GET /workspaces/{slug}/signals` — `due_date_risk`, `blocker_chain`,
`stale_work`, `workload_imbalance`. Each signal carries **evidence** (task
links you can open), **freshness**, **confidence**, **limitations** (what
the rule can't see), and **alternatives** (options, not orders). Disabled
signal types are filtered per viewer.

`GET /workspaces/{slug}/brief` — personal daily brief: top-5 focus + the
signals whose evidence touches your tasks.

## Anti-surveillance guard (`lib/intel/guard.ts`)

`assertNoSurveillance(payload)` runs on **every** intelligence payload
before it is returned. It throws `SurveillanceGuardError` on any key
matching productivity/performance/efficiency/ranking/rating/emotion/
sentiment/keystroke/idle-time, or any string with a judgemental phrase
("top performer", "underperforming", …). Workload-imbalance evidence points
at **tasks**, never at a named person, and the label is generic
(`member:xxxx`). Exhaustively unit-tested; the daily brief passes it end to
end in an integration test.

> Managers cannot use this feature to infer personality, emotion,
> productivity scores, or automated performance decisions — enforced in
> code, not just policy (charter §5, compliance decisions).

## Feedback & quality

`POST /workspaces/{slug}/signals/feedback` — typed verdict
(`false_alarm` / `missed` / `helpful` / `wrong_evidence`) **tied to the
`ruleVersion`** that produced the signal, so a later rule change is
attributable. `GET .../signals/quality` (admin+) aggregates it by type +
version — the offline-eval view of false alarms vs. missed risks.

## Schema

`SignalPreference` (per-member enable/weight), `SignalFeedback` (verdict +
ruleVersion). Migration `20260906002400`.
