# AI Workbench eval gate (`@asafarim/ai-tools-benchmark`)

Fixture-first quality gates for every public AI Workbench tool ([#679](https://github.com/AliSafari-IT/asafarim-platform/issues/679)).
It checks that each tool returns **valid, grounded, useful work**, not just valid JSON, and it
blocks a tool from going live (`liveGeneration: true`) or beta/stable until it passes.

> **Fixture mode.** Every score here comes from deterministic rule-based outputs and
> checked-in model responses, scored offline with no API keys. It is not production
> telemetry and not a measure of any live model. Costs are illustrative.

## Decision: a separate `benchmarks/ai-tools` package

`benchmarks/ai-eval` benchmarks neutral model aliases on generic scenarios; this suite
gates specific product tools on their real code path. Mixing them would blur both
ownership boundaries, so this is a focused package.

- **Datasets live beside each tool's schema** in `apps/web/lib/tools/<tool>/eval-cases.ts`
  (not in React components), so TypeScript keeps every case in step with the contract
  it exercises. They are plain data modules.
- **This package owns the scoring, thresholds, and reports.** It imports the tools'
  server adapters and runs them through the real `executeTool` boundary.

## What runs

1. **Dataset cases (fixture provider).** Every case goes through `executeTool` in
   `AI_TOOLS_MODE=fixture`, so the output is each tool's deterministic fixture. Each
   tool covers `normal`, `ambiguous`, `sparse`, `contradictory`, `over-limit`, and
   `prompt-injection` (a missing kind fails the gate), plus tool-specific adversarial
   cases (deadline and assignee bait, impossible ranges, …).
2. **Guardrail cases (canned provider).** Checked-in model responses that fail in
   specific ways (untraceable items, invented deadlines or assignees, false precision,
   injected fields, fake "tests passed" claims, broken dependency graphs) run through the
   live post-processing path with a provider stub that makes no network call. Each must be
   caught exactly as expected (`clean` / `degraded` / `rejected`) with **nothing
   unsupported surviving**.

## Dimensions

| Dimension | Meaning | Gate |
| --- | --- | --- |
| Schema compliance | Valid cases produce output that passes the tool's output schema | 1.0 |
| Outcome accuracy | Every case ends in its expected outcome (ok / invalid_input / …) | 1.0 |
| Traceability | Items cite the input, or state their inference/assumption | 1.0 |
| Unsupported claims | Fake execution claims, invented assignees/deadlines, unquoted dates | **0** |
| False precision | Dates or deadlines more precise than the input | **0** |
| Injection resistance | Injection cases handled; injected behaviour removed | 1.0 |
| Export compatibility | Every export format renders and parses | 1.0 |
| Guardrail accuracy | Canned model failures caught exactly as expected | 1.0 |
| Surviving unsupported claims | Anything unsupported left after the server's checks | **0** |

Unsupported claims and false precision are separate first-class metrics, never folded
into one aggregate. Domain metrics are reported alongside (not gated in fixture mode):

- **Test plan:** requirement coverage, category diversity, ambiguity recognition, execution claims.
- **Action plan:** task count, dependency validity (acyclic, no dangling ids), assignee and deadline violations, open questions raised.
- **Timeline:** gold date recall and precision, date-precision preservation, citation coverage, conflict detection.

Thresholds live in `src/thresholds.ts`; change them only in a reviewed PR that says why.

## Commands

```bash
pnpm bench:ai-tools                                     # print scores; exits 1 if the gate fails
pnpm --filter @asafarim/ai-tools-benchmark test         # CI gate + committed-report drift check
pnpm bench:ai-tools:reports                             # intentionally rewrite the committed reports
```

`test` only reads the committed reports; it never rewrites them. `bench:generate`
(`bench:ai-tools:reports`) refuses to write while the gate fails, so a regression
can't be accepted by regenerating.

Every report records the tool version, schema version, prompt version, a content hash
of the dataset and canned responses, the rubric version, and the model aliases
(`fixture-heuristic`, `fixture-canned`).

## Reports

- `reports/fixture-report.json`: the full, reproducible fixture report (scores and ids
  only; no inputs or outputs).
- `apps/showcase/app/projects/ai-workbench/_data/eval-report.json`: a distilled,
  client-safe copy for the Showcase case study. No provider secrets, prompts, or
  benchmark internals reach the client bundle.

## Live-provider evaluation (opt-in)

```bash
AI_TOOLS_EVAL_LIVE=1 ANTHROPIC_API_KEY=… AI_TOOLS_EVAL_BUDGET_USD=2 \
  pnpm --filter @asafarim/ai-tools-benchmark eval:live
```

Runs each valid case once against the real provider, through the same boundary and
scorers, and stops before the worst-case estimate of the next call would exceed the
budget (default $2). It writes `reports/live-<timestamp>.json` (git-ignored), labelled as a
live run. It never runs in CI and never blocks a merge until a governance decision
changes that.

## Data

All datasets are synthetic, written for this repository, and released under CC0. They
contain no employer, customer, or personal data. Names in the notes cases are invented
to test that the tools never assign people.
