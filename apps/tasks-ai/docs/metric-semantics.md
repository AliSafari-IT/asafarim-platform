# TasksAI — Metric semantics (M10)

Every number in the analytics surface is computed by a pure function in
`lib/analytics/` and carries a **semantics version** (`flow@1`,
`throughput-sample@1`). When a definition changes the version bumps and old
`MetricSnapshot` rows keep their original `defVersion`, so history survives
redefinition.

> These metrics describe the **flow of work** — tasks, dates, dependencies.
> None of them describes an individual. The `assertNoSurveillance` guard
> (from M08) runs on every analytics payload; opaque employee rankings,
> emotion analysis, keystroke monitoring, and automated employment
> decisions are prohibited and structurally impossible here.

## `flow@1`

| Metric | Definition |
|---|---|
| **Cycle time** `p50/p85/p95` | For tasks *completed in the window*: days from `startedAt` (first `task.status_changed` activity) — or `createdAt` if never moved — to `completedAt`. Percentiles over that set. |
| **Throughput** | Count of tasks completed in the window; `perDay` = count ÷ window days. |
| **Aging WIP** | Open (not completed, not archived) tasks bucketed by age since start: `0-3d / 4-7d / 8-14d / 15-30d / 30d+`. |
| **Predictability (CV)** | Coefficient of variation (σ/μ) of the last 8 weekly throughput counts. Lower = steadier. `0` when μ = 0. |

Window default 30 days; `?projectId=` scopes to one project.

## `throughput-sample@1` (forecast)

A seeded Monte Carlo (`mulberry32`, default seed 42 → **deterministic and
backtestable**):

1. Draw a value from the observed weekly-throughput history (with ±0.5
   jitter so a flat history still yields a band).
2. Accumulate until `remaining` scope is burned down; record the week count.
3. Repeat `trials` (2000) times; report p50 / p80 / p95 completion **dates**.

**Assumptions** (returned with every forecast): sampled from N weeks of
observed throughput; scope does not grow; team composition stable. A history
shorter than 4 non-zero weeks → `reliable: false` and the assumptions say
"treat this as a rough guess". `backtest()` reports p80 coverage over past
finishes.

## Project health (`portfolio`)

`at_risk` when overdue > 5 **or** predictability CV > 0.8; `watch` when
overdue > 0; else `on_track`. Derived only from task dates and the flow
metrics above.

## Goal progress

Per key result: `clamp01((current − start) / (target − start))`. Goal
progress = mean across its key results, or `null` with no key results.

## Exports & snapshots

- `POST .../analytics/snapshot` freezes `cycle_time_p50`,
  `throughput_per_day`, `predictability_cv` as `MetricSnapshot` rows.
- `GET .../analytics/metrics/{metric}` returns the history with each point's
  `defVersion` and window — so a chart can show where the definition changed.
