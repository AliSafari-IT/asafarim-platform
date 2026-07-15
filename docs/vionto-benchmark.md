# Vionto Studio benchmark — methodology

Vionto Studio scores a schema-validated, multi-stage AI media pipeline —
brief → script → storyboard → asset plan → render — built around an explicit
job state machine with human approval gates and idempotent retry. It ports
the domain insight of a personal AI video-story project (its render-job
state machine and idempotent retry rule), not its implementation. The full
architecture of that legacy application is documented in
[vionto-architecture.md](vionto-architecture.md).

- **Runnable harness:** [`benchmarks/vionto`](../benchmarks/vionto) — the
  pipeline engine, synthetic fixtures, hand-reviewed labels, tests, generator.
- **Read-only demo:** `apps/showcase/app/projects/vionto` (published at
  `/projects/vionto`), including a client-side **Pipeline Explorer** that runs
  the real engine in the browser against committed fixtures.

## The pipeline

`benchmarks/vionto/engine/pipeline.mjs` implements a pure, deterministic
state machine over five stages: **script → storyboard → asset-plan → render
→ done**. Two explicit human approval gates sit before storyboard generation
(after script) and before rendering (after asset-plan) — the pipeline will
not proceed past either without an explicit `approve()` call, and a human can
`reject()` at either gate, ending the run at `cancelled` (a legitimate
terminal state, not a failure).

Every stage's output is validated against a JSON schema
(`engine/manifest.mjs`) before the pipeline advances — a malformed asset plan
is caught immediately, never silently passed to the expensive render stage.

## Idempotent retry

`retry(job, ctx)` is legal **only** from `failed` or `cancelled` — the engine
throws otherwise. It never mutates the job being retried: it returns a
brand-new job object with `retryCount + 1` that resumes at the stage that
failed or was rejected. This directly ports the legacy render-job retry
route's rule (`state !== "failed" && state !== "cancelled"` → reject the
retry) and generalizes it to every stage, not just rendering.

## Provider adapters

This benchmark ships **fixture mode only**. `engine/providers.mjs` declares
the `ScriptProvider`/`RenderProvider` interface a real adapter (an LLM for
scripts, a render worker for video) would implement, and the only
implementation wired up — `FixtureProvider` — is a deterministic lookup into
a brief's committed fixture data. A `LiveProviderStub` documents the seam but
always throws, even when explicitly asked to run live
(`{ confirmLive: true }`), because **no live provider integration exists in
this repo**.

## Synthetic assets and licensing

Every asset referenced in `fixtures/assets.json` is a placeholder descriptor
(a labelled swatch, not a real image/video/audio file), each carrying an
explicit `"license": "CC0 (synthetic placeholder, no real media)"` field.
There is no real media anywhere in this package.

## The five dimensions

| Dimension | What it asks | How it's measured |
| --- | --- | --- |
| **Structured-output validity** | Does every stage produce schema-valid output? | Share of schema-validated generation attempts (script/storyboard/asset-plan) that passed validation, across every brief and every retry. |
| **Retry & idempotency correctness** | Can a failed/cancelled run be retried safely? | Every retry step is checked: it must produce a new, uniquely-identified job, and the engine itself refuses retry from any other state. |
| **End-to-end completion time** | How long does a full run take? | Mean *representative reference* latency across successfully completed runs — not a live measurement (see Limitations). |
| **Estimated vs. observed cost** | Does the pre-run estimate match reality? | Maximum delta between `engine/cost.mjs`'s pre-run estimate and the cost recomputed from final artifacts. |
| **Recovery from seeded stage failures** | Does a deliberately broken stage recover via retry? | Share of briefs seeded with a stage failure that reach `succeeded` via the documented retry path. |

## Seeded failures and fixtures

`fixtures/briefs.json` holds 5 synthetic briefs, each demonstrating a
distinct path through the state machine (ground truth in
`fixtures/labels.json`):

| Brief | Path |
| --- | --- |
| `B-01` | Happy path — both approval gates accepted on the first pass. |
| `B-02` | **Seeded schema-validation failure**: the first asset plan is missing a required field and fails validation; retry regenerates a valid one. |
| `B-03` | **Seeded transient render failure**: the render stage fails on the first attempt (a simulated encode error); retry succeeds without regenerating anything upstream. |
| `B-04` | A human **rejects** the generated script, then retries; the identical script is regenerated and approved on the second pass. |
| `B-05` | A human rejects the generated script and the run is **never retried** — `cancelled` is a legitimate, final outcome. |

## Cost/latency methodology

`engine/cost.mjs`'s `estimateCost(brief)` is a pure function of a brief's
declared scene/shot counts and a set of fixed reference rates (never live
provider pricing). The generator recomputes an "observed" cost from the
actual final artifacts using the same formula. **In fixture mode the delta is
always zero** — nothing about a brief varies between estimate-time and
generation-time without a live provider to introduce real variance.
Connecting a real adapter is where deviation would first appear; this
benchmark sets up the comparison honestly rather than fabricating a
non-zero number.

## Limitations

- Five hand-authored briefs demonstrate the method — a happy path, two seeded
  failures, two rejection paths — not statistical significance at scale.
- "Estimated vs. observed" cost is zero-delta by construction in fixture
  mode; see Cost/latency methodology above.
- The fixture renderer (`engine/renderer.mjs`) produces a structured JSON
  report and an SVG storyboard strip, not actual video or image encoding —
  there is no media pipeline dependency in this benchmark, synthetic or
  otherwise.
- Completion-time figures are representative reference numbers, not live
  measurements — the engine itself is a pure in-memory reducer and runs in
  sub-millisecond time.

## Toward a production version

A real deployment of this pipeline would additionally need: real provider
adapters (an LLM for scripts, a render worker for video) implementing the
same interface, gated behind explicit flags and a cost-confirmation step;
real asset storage, licensing, and rights verification for non-synthetic
media; durable queue/worker infrastructure so a job survives a process
restart with the same state machine and idempotent-retry semantics enforced
server-side; and audit logging/access control around who can approve or
reject a run at each gate.
