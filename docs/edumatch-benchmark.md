# EduMatch benchmark — methodology

EduMatch scores a transparent, deterministic tutor-matching engine against
synthetic students and tutors. It ports the domain insight of a personal
tutoring-marketplace project — weighted, multi-factor matching — not the
marketplace implementation.

- **Runnable harness:** [`benchmarks/edumatch`](../benchmarks/edumatch) —
  matching engine, synthetic fixtures, hand-reviewed labels, tests, generator.
- **Read-only demo:** `apps/showcase/app/projects/edumatch` (published at
  `/projects/edumatch`), including a client-side **Match Explorer** that runs
  the real engine in the browser against committed fixtures.

## The matching engine

`benchmarks/edumatch/engine/matching.mjs` is pure and deterministic: no
database, no clock, no randomness. It runs in two phases:

1. **Hard constraints** — subject, level, shared language, availability
   overlap, and mode/distance are checked first. A tutor who fails any one is
   excluded, and every exclusion carries a machine-readable reason (e.g. `{
   code: "language", detail: "no shared language" }`). A constraint violation
   is never ranked, no matter how well it would otherwise score.
2. **Weighted scoring** — every constraint-passing tutor gets a per-factor
   score (0–1) for distance, subject specialisation, level fit, a
   Bayesian-damped rating, and verification status. Each factor's
   `value × weight = contribution`, and the five contributions sum exactly to
   the composite score shown in the demo.

Default weights (ported from the legacy algorithm): distance 30%, subject
25%, level 15%, rating 20%, verification 10%. They are an input, not a
constant — the Match Explorer lets a visitor move them and re-rank live,
using this exact engine.

## Synthetic data and sensitive-attribute policy

`benchmarks/edumatch/fixtures/tutors.json` and `needs.json` are entirely
invented. Locations are small offsets from `(0, 0)` — a conventional
"clearly not a real address" anchor — used only to exercise distance/radius
logic.

The engine models **qualification and logistics only**: subject, level,
language, availability, mode/distance, rating, and verification. It has no
field for age, gender, ethnicity, disability, religion, or any other
protected attribute. There is nothing to weight, by construction, not by a
filter added afterward.

## The five dimensions

| Dimension | What it asks | How it's measured |
| --- | --- | --- |
| **Match relevance** | Do the top recommendations agree with a labeled ground truth? | Share of student needs whose full ranked order exactly matches the hand-reviewed label in `fixtures/labels.json`. |
| **Constraint satisfaction** | Does every recommendation actually meet the student's hard requirements? | Measured across every need: no ranked result ever appears in that need's excluded list. |
| **Explainability** | Does every recommendation state exactly why it appears? | Share of ranked results whose per-factor contributions sum exactly to the displayed composite score. |
| **Fairness** | Do two equally-qualified tutors score identically regardless of an unrelated tag? | Maximum composite-score delta between a constraint-identical **twin pair** (`T-01`/`T-04`) across every need where both are eligible. |
| **Ranking stability** | Does adding an unrelated candidate leave the existing order unchanged? | Adding a constraint-failing filler tutor to the pool and checking the existing ranking order is untouched. |

## Fairness method: the twin pair

`T-01` and `T-04` are fixture-designed to be identical on every matching
attribute — subjects, levels, languages, modes, availability, location,
rating, review count, verification — and differ only in a neutral `cohort`
tag the engine never reads. If their scores ever diverged, it would mean the
engine is reacting to something outside its declared factors. The measured
delta is `0.000` across every need where both are eligible (see the
Fairness page and `tests/matching.test.mjs`).

This tests one specific, provable claim: **the engine is blind to the one
attribute that differs between the twins.** It does not certify fairness
across attributes a production system might inadvertently correlate with —
see Limitations below.

## Edge cases

- **Tight availability** (`N-04`): only one tutor is free at the exact
  requested slot; every other otherwise-qualified tutor is excluded on
  availability.
- **No qualified tutor** (`N-05`): no fixture tutor teaches the requested
  subject. The engine returns an empty ranked list — it does not relax a
  requirement to force a result — and every excluded tutor's reason names the
  subject constraint.

## Determinism and testing

`tests/matching.test.mjs` (`node --test`) checks: identical inputs produce
byte-identical output; constraint violations are never ranked; labeled
rankings match the engine; the no-qualified-tutor case excludes everyone; the
twin pair scores identically on every need where both are eligible; adding an
irrelevant tutor to the pool does not reorder existing results; an
all-weight-on-rating run is monotonic in the rating factor; and every factor
breakdown sums exactly to its composite.

`scripts/generate-fixtures.mjs` re-runs these same checks, then emits
byte-stable `match-results.json` and `benchmark-scores.json` into
`apps/showcase/app/projects/edumatch/_data/` — re-running produces no diff.
A mismatch (fixtures or engine changed without regenerating) exits non-zero,
which is what CI gates on (see
`.github/workflows/edumatch-benchmark.yml`).

## Limitations

- Ground truth is hand-reviewed against a small, hand-authored fixture set
  (12 tutors, 6 needs) — it demonstrates the method, not statistical
  significance at scale.
- "Fairness" here means blindness to one unmodelled attribute in a
  controlled twin test, not a real-world fairness audit.
- Latency figures shown in the demo are representative reference timings
  from a fixed run, not live measurements. The engine itself runs in low
  single-digit milliseconds against this fixture size.
- The Journey page (`/projects/edumatch/journey`) is a client-side state
  machine with no network calls and nothing persisted — it demonstrates the
  shape of a multi-role workflow, not a working booking system.

## Toward a production version

A real deployment of this matching engine would additionally need: verified
identity and credential checks for tutors, real payments and escrow with
dispute handling, moderation and trust & safety tooling, data protection and
consent handling for whatever real personal data is collected, and fairness
audits against real usage data rather than a single engineered twin test.
