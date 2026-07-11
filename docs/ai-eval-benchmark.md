# AI Evaluation Lab — methodology

A **provider-neutral, fixture-mode** benchmark that scores capability-tier model
aliases against small, version-controlled synthetic datasets. Because inputs,
expected outputs, prompts, and model responses are all checked in, the whole
benchmark runs offline with no API keys and produces the same scores every time.

- **Runnable harness:** [`benchmarks/ai-eval`](../benchmarks/ai-eval).
- **Read-only demo:** `apps/showcase/app/projects/ai-eval` (`/projects/ai-eval`)
  plus a compact card on the `apps/web` homepage. The demo renders committed
  fixture JSON only — no runner, no eval, no network.

> **Data & IP policy.** Synthetic, openly-licensed (CC0) datasets and
> provider-neutral aliases only. No employer or customer data, prompts,
> branding, or architecture appears anywhere.

## Scenarios

| # | Scenario | Tests | Safety probe |
| --- | --- | --- | --- |
| 1 | Structured extraction | Field accuracy + strict-schema output | Source PII must not be extracted |
| 2 | Retrieval-grounded QA | Answer only from passages; cite them | An injected instruction hidden in a passage must be ignored |
| 3 | Tool / function-call selection | Right tool + schema-valid args | A destructive action must route through a confirmation tool |

Datasets live in `benchmarks/ai-eval/datasets/`; each carries a JSON schema used
for the format-compliance score.

## Model aliases

Provider-neutral, capability-tier stand-ins (`benchmarks/ai-eval/providers/catalog.mjs`):

- `frontier-a` — highest capability, priciest, higher latency.
- `balanced-b` — mid tier.
- `compact-c` — smallest/cheapest/fastest; trades accuracy and robustness.

Real provider adapters would plug in behind these aliases. Pricing is
illustrative $/1M tokens, used only to compute a comparative estimated cost.

## Scoring (six dimensions)

| Dimension | How it's measured |
| --- | --- |
| **Correctness** | Field accuracy (extraction), normalized answer match (QA), correct tool + args (tools). |
| **Groundedness** | Citation F1 against the expected passages (QA). |
| **Format compliance** | Output validated against the scenario's JSON schema (types, enums, no extra keys). |
| **Latency** | Mean response time recorded in the fixtures (representative). |
| **Estimated cost** | Token counts × alias pricing, reported per 1,000 cases. |
| **Safety** | Seeded probes: no PII extraction, ignore injected instructions, no unconfirmed destructive call. |

All scorers are pure functions in `benchmarks/ai-eval/scoring/scorers.mjs`.

## Determinism & provenance

Every model response is a committed fixture and every scorer is pure, so
re-running the suite — and regenerating the committed showcase fixtures — is
byte-for-byte stable. The generator
([`scripts/generate-fixtures.mjs`](../benchmarks/ai-eval/scripts/generate-fixtures.mjs))
first **validates** the scored invariants (frontier tier perfect, compact tier
shows the seeded failures, the v1→v2 regression present) and exits non-zero on a
mismatch, then **emits** `leaderboard.json`, `run-detail.json`, and
`regression.json`.

Latency and cost are labelled as representative fixtures and never presented as
live measurements.

## The documented regression

Prompts are versioned (`benchmarks/ai-eval/prompts/prompts.mjs`). Revising the
tool-selection prompt from `v1` to a stricter `v2` ("arguments only, no prose")
helps the larger models but pushes `compact-c` to emit an enum-invalid argument
on `tool-1`, dropping that case from passing to failing on format compliance.
The `/projects/ai-eval/regression` page and `regression.json` document it — a
concrete example of a prompt change caught by a regression comparison.

## Limitations

- Aliases are capability-tier stand-ins, not specific vendors — the numbers show
  an evaluation method, not a vendor ranking.
- Datasets are tiny and synthetic; scores show the shape of an evaluation, not a
  general-capability claim.
- Latency and cost reflect a reference run, not your environment or current
  pricing.
- No live inference runs in the public demo.

## Running it

```bash
pnpm bench:ai-eval            # print the leaderboard + regression check
pnpm bench:ai-eval:fixtures   # validate invariants + rebuild the showcase fixtures
```

No install step, no browser, no API keys. CI runs both and fails if the
committed fixtures drift (see `.github/workflows/ai-eval-benchmark.yml`).
