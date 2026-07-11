# Testora benchmark — methodology

Testora measures a test-automation setup against a **fixed, offline sample
application** that carries intentional, seeded defects. Because the system
under test (SUT) is deterministic, the benchmark can state exactly what a good
suite should find — and prove it finds it on every run.

- **Runnable harness:** [`benchmarks/testora`](../benchmarks/testora) — sample
  app, seeded Playwright specs, config, generator.
- **Read-only demo:** `apps/showcase/app/projects/testora` (published at
  `/projects/testora`). Renders committed fixture JSON only; it never executes
  test code.

## The system under test

`benchmarks/testora/sample-app` is a pure static app: no network, no storage,
no wall-clock timers. Every screen renders purely from the URL query
(`?screen=`, `?attempt=`), so behaviour is a pure function of its inputs and a
run is fully reproducible.

Three behaviours carry **seeded defects** — the known regressions the benchmark
measures detection against. They are intentional; do not "fix" them.

| Scenario id | Kind | Seeded defect |
| --- | --- | --- |
| `auth-valid-login` | pass | — (baseline) |
| `auth-reject-bad-password` | pass | — (baseline) |
| `auth-trim-email` | fail | Email compared without trimming; a trailing space rejects a valid user. |
| `checkout-item-count` | pass | — (baseline) |
| `checkout-total-includes-tax` | fail | Displayed total omits tax (`$50.00` instead of `$55.00`). |
| `dashboard-widget-loads` | flaky | Widget mount races an init signal; first attempt renders nothing. |

Ground truth lives in [`fixtures/scenarios.mjs`](../benchmarks/testora/fixtures/scenarios.mjs)
and drives both the specs and the scoring.

## Determinism

- **Seeded hard failures** assert behaviour the SUT deliberately violates, so
  they fail on every attempt.
- The **controlled flake** passes `testInfo.retry` as the `attempt`: attempt 0
  never mounts the widget (fail), the retry does (pass). Fail-then-pass within
  one run is the flake signature. Requires `retries: 1` in the Playwright config.
- Single worker, no parallelism, fixed ports — reproducible ordering and timing.

## The five dimensions

| Dimension | What it asks | How it's measured |
| --- | --- | --- |
| **Detection rate** | Does the suite catch every seeded regression? | Share of seeded `fail` scenarios that end the run failed. Target 100%. |
| **Flaky-test identification** | Flake vs. stable regression? | The `flaky` scenario must report fail-then-pass, not passed and not hard-failed. |
| **Time to useful diagnosis** | How fast is a failure actionable? | Mean wall-time across failing scenarios to a concise, cause-level diagnostic. |
| **Artifact completeness** | Is every failure backed by evidence? | For each non-passing scenario: trace + screenshot + video retained. Completeness = captured / expected. |
| **CI reproducibility** | Same inputs → same outcomes? | Re-running the suite and regenerating fixtures is byte-for-byte stable. |

## Fixture provenance

Running the harness (`pnpm bench:testora`) produces a Playwright JSON report and
real trace/screenshot/video binaries. The generator
([`scripts/generate-fixtures.mjs`](../benchmarks/testora/scripts/generate-fixtures.mjs))
then does two things:

1. **Validates** that live outcomes still match the seed catalog's ground truth
   — seeded regressions stay failed, baselines pass, the flake shows
   fail-then-pass. A mismatch (a seeded defect got "fixed", or the detector
   regressed) exits non-zero, so CI catches it.
2. **Emits** `run-detail.json` + `runs.json` under
   `apps/showcase/app/projects/testora/_data/`, derived purely from the catalog
   and a fixed reference block — no wall-clock time, no raw millisecond jitter.
   Re-running produces a byte-identical result.

The demo therefore renders a **distilled, reproducible snapshot**. It is not
production telemetry, and no event on those pages is a real user event. The
runnable harness and CI upload the real artifacts as the citable source.

## Running it

```bash
# one-time: install the browser
pnpm --filter @asafarim/testora-benchmark exec playwright install chromium

pnpm bench:testora            # run the benchmark (seeded fails are expected)
pnpm bench:testora:fixtures   # validate + rebuild the showcase fixtures
```

`pnpm bench:testora` exits non-zero because seeded failures exist — that is
expected. Benchmark success is defined by the generator's validation step, not
by Playwright's exit code. CI runs the suite, then runs the generator as the
gate (see `.github/workflows/testora-benchmark.yml`).
