# Vionto Studio benchmark (`@asafarim/vionto-benchmark`)

A deterministic AI media-**pipeline** benchmark. It ports the domain insight
of a personal AI video-story project — a schema-validated, multi-stage
pipeline with a job state machine, human approval gates, and idempotent
retry — not its implementation. No LLM calls, no FFmpeg, no queue
infrastructure, no real media.

## Synthetic-data policy

Every brief, script, storyboard, and asset in `fixtures/` is invented for
this benchmark. Assets are placeholder descriptors (`fixtures/assets.json`),
each explicitly licensed `CC0 (synthetic placeholder, no real media)` — there
is no real image, video, or audio anywhere in this package.

## Layout

| Path | What it is |
| --- | --- |
| `engine/manifest.mjs` | Schema shapes for script/storyboard/asset-plan + a minimal JSON-schema validator (same style as `benchmarks/ai-eval/scoring/scorers.mjs`). |
| `engine/providers.mjs` | `FixtureProvider` (deterministic, fixture-backed) and `LiveProviderStub` (documents the adapter seam; always throws — no live provider is implemented in this repo). |
| `engine/cost.mjs` | Pure cost/latency estimate from a brief, using fixed reference rates — never live pricing. |
| `engine/pipeline.mjs` | The state machine: `createJob`, `advance` (start/approve/reject), `retry` (legal only from `failed`/`cancelled`, idempotent — a new job, never a mutation). |
| `engine/renderer.mjs` | Fixture renderer: turns a validated asset plan into a structured render report + an SVG storyboard strip. No image/video encoding. |
| `engine/replay.mjs` | Replays a fixed event sequence against a fresh job — shared by the tests and the generator. |
| `engine/index.mjs` | Public entry point, exported as `@asafarim/vionto-benchmark/engine`. |
| `fixtures/briefs.json` | 5 synthetic briefs: a happy path, a seeded schema-validation failure, a seeded transient render failure, a human-rejection-then-retry, and a human-rejection-with-no-retry. |
| `fixtures/labels.json` | Hand-reviewed ground truth: the event sequence and expected terminal state for each brief. |
| `tests/pipeline.test.mjs` | `node --test`. |
| `scripts/generate-fixtures.mjs` | Re-validates against `labels.json`, then emits byte-stable JSON into `apps/showcase/app/projects/vionto/_data/`. |

## Provider adapters

This benchmark ships **fixture mode only**. `engine/providers.mjs` documents
the interface a real provider adapter (an LLM for scripts, a render farm for
video) would implement, and a `LiveProviderStub` that always throws — even
when explicitly asked to run live — because no live integration exists here.
See `docs/vionto-benchmark.md` for the full policy.

## Commands

```bash
pnpm --filter @asafarim/vionto-benchmark test           # run the pipeline test suite
pnpm --filter @asafarim/vionto-benchmark bench:generate  # rebuild showcase fixtures
```
