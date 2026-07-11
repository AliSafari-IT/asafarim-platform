# Testora benchmark (`@asafarim/testora-benchmark`)

A deterministic, offline Playwright benchmark. It runs a small **sample
application** (the system under test, `sample-app/`) that carries three
intentional, seeded defects, plus baseline correct behaviours. The suite's job
is to _detect the seeded regressions and correctly identify the seeded flake_ —
and to prove it does so reproducibly, with complete artifacts.

The distilled results are committed as fixture JSON under
`apps/showcase/app/projects/testora/_data/` and rendered by the **read-only**
Showcase demo. The public demo never executes any of this code — it only reads
the committed evidence.

## Layout

| Path | What it is |
| --- | --- |
| `sample-app/` | Pure static SUT — no network, no storage. Behaviour is a function of the URL query only, so runs are reproducible. |
| `fixtures/scenarios.mjs` | The **seed catalog** — ground truth for every scenario (pass / fail / flaky), its dimension, seeded defect, and expected diagnosis. |
| `tests/*.spec.ts` | Playwright specs, one per suite. Each test title is prefixed with its scenario id. |
| `playwright.config.ts` | Deterministic config: 1 worker, `retries: 1`, full trace/screenshot/video. |
| `scripts/generate-fixtures.mjs` | Reads the Playwright JSON report → writes the Showcase fixture JSON + a couple of small screenshots. |

## Determinism

- The SUT is offline and stateless; every screen renders purely from `?screen=`
  and `?attempt=`.
- **Seeded hard failures** (`auth-trim-email`, `checkout-total-includes-tax`)
  assert correct behaviour the SUT deliberately violates, so they fail on every
  attempt.
- The **controlled flake** (`dashboard-widget-loads`) passes `testInfo.retry` as
  the `attempt`; attempt 0 never mounts the widget (fail), the retry does
  (pass). Fail-then-pass within one run is the flake signature.

## Commands

```bash
pnpm --filter @asafarim/testora-benchmark test          # run the benchmark
pnpm --filter @asafarim/testora-benchmark bench:generate # rebuild showcase fixtures
pnpm --filter @asafarim/testora-benchmark bench          # both
```

First run downloads the Chromium build: `pnpm --filter @asafarim/testora-benchmark exec playwright install chromium`.

Methodology and the five benchmark dimensions are documented in
[`docs/testora-benchmark.md`](../../docs/testora-benchmark.md).
