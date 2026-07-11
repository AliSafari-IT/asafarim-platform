# AI Evaluation Lab (`@asafarim/ai-eval-benchmark`)

A **provider-neutral, fixture-mode** AI benchmark. It scores capability-tier
model aliases (`frontier-a`, `balanced-b`, `compact-c`) against small,
version-controlled **synthetic** datasets across three neutral scenarios, on six
dimensions — correctness, groundedness, format compliance, latency, estimated
cost, and safety.

Every "model response" is a checked-in JSON fixture, so the whole suite runs
**offline with no API keys** and produces the same scores every time. The
distilled results are committed under `apps/showcase/app/projects/ai-eval/_data/`
and rendered by the **read-only** Showcase demo, which never runs any of this.

> Synthetic, openly-licensed (CC0) data and provider-neutral aliases only. No
> employer or customer data, prompts, branding, or architecture appears anywhere.

## Layout

| Path | What it is |
| --- | --- |
| `datasets/*.json` | Version-controlled inputs + expected outputs + JSON schemas. |
| `prompts/prompts.mjs` | Versioned prompt templates (v1, v2) per scenario. |
| `providers/catalog.mjs` | Neutral alias metadata: tier, illustrative pricing. |
| `providers/fixtures/*.json` | Checked-in model outputs per case × prompt version. |
| `scoring/scorers.mjs` | Pure scorers + a minimal JSON-schema validator. |
| `runner/evaluate.mjs` | The scoring core (shared by the CLI and the generator). |
| `runner/run.mjs` | Prints the fixture-mode leaderboard + regression check. |
| `scripts/generate-fixtures.mjs` | Validates invariants → emits Showcase fixtures. |

## Scenarios & seeded failures

1. **Structured extraction** — strict-schema field extraction; a safety case
   where source PII must not be extracted.
2. **Retrieval-grounded QA** — answer only from passages and cite them; a case
   with a prompt-injection instruction hidden in a passage.
3. **Tool / function-call selection** — pick one tool and emit schema-valid
   arguments; a destructive action must route through a confirmation step.

`compact-c` carries the seeded failures (a wrong extraction field, a
prompt-injection follow, an unsafe delete) and a **documented regression**: the
stricter `v2` tool-selection prompt breaks its format compliance on `tool-1`.

## Commands

```bash
pnpm --filter @asafarim/ai-eval-benchmark eval            # print the leaderboard + regression
pnpm --filter @asafarim/ai-eval-benchmark bench:generate  # validate + rebuild showcase fixtures
pnpm --filter @asafarim/ai-eval-benchmark bench           # both
```

No install step, no browser, no keys. Methodology is documented in
[`docs/ai-eval-benchmark.md`](../../docs/ai-eval-benchmark.md).
