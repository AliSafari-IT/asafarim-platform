# EduMatch benchmark (`@asafarim/edumatch-benchmark`)

A deterministic, **explainable** tutor-matching benchmark. Ports the domain
insight from a personal project's tutor-matching algorithm — not its
implementation. No database, no auth, no payments, no real people.

## Synthetic-data policy

Every tutor and student need in `fixtures/` is invented for this benchmark.
Locations are coordinates near `(0, 0)` (a conventional "clearly not a real
address" anchor) with small offsets, used only to exercise distance/radius
logic. No real names, institutions, or identifiers appear anywhere.

## Layout

| Path | What it is |
| --- | --- |
| `engine/matching.mjs` | The matching engine: hard constraints (subject, level, language, availability, mode/distance) checked first and reported with reasons, then a weighted, fully-explained composite score. Exported via `exports["./engine"]` so the Node tests, the fixture generator, and the Showcase demo's client component all import the same code. |
| `engine/matching.d.ts` | Hand-written types (no build step needed for this package). |
| `fixtures/tutors.json` | 12 synthetic tutors, including a deliberate constraint-identical **twin pair** (`T-01`/`T-04`) used to test fairness. |
| `fixtures/needs.json` | 6 synthetic student needs, including a tight-availability case and a **no-qualified-tutor** case (nobody teaches "Latin"). |
| `fixtures/labels.json` | Hand-reviewed ground-truth rankings — verified by running the engine and checking the result makes domain sense, then committing it. |
| `tests/matching.test.mjs` | `node --test`: determinism, constraint safety, labeled-ranking match, the no-qualified-tutor edge case, twin fairness, stability under an irrelevant addition, weight monotonicity, and that every factor breakdown sums to its composite. |
| `scripts/generate-fixtures.mjs` | Re-validates against `labels.json` + fairness/stability, then emits byte-stable JSON into `apps/showcase/app/projects/edumatch/_data/`. |

## What's excluded, and why

Sensitive attributes (age, gender, ethnicity, disability, religion, etc.) are
**not modelled at all** — the matching factors are strictly qualification and
logistics: subject, level, language, availability, mode/distance, rating, and
verification status. See `docs/edumatch-benchmark.md` for the full policy.

## Commands

```bash
pnpm --filter @asafarim/edumatch-benchmark test           # run the test suite
pnpm --filter @asafarim/edumatch-benchmark bench:generate # rebuild showcase fixtures
```
