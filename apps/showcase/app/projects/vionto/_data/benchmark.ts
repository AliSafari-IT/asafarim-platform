import type { BenchmarkDimension, BenchmarkScores, RunEntry } from "./types";
import runsJson from "./runs.json";
import scoresJson from "./scores.json";

/**
 * Authored benchmark metadata + typed accessors for the generated fixtures.
 * The prose here is stable and human-written; the numbers come from the
 * committed fixtures produced by the harness (benchmarks/vionto).
 */

export const runs = runsJson as RunEntry[];
export const scores = scoresJson as BenchmarkScores;

export function getRun(briefId: string): RunEntry | undefined {
  return runs.find((r) => r.briefId === briefId);
}

/** The five dimensions Vionto Studio scores, straight from issue #14. */
export const dimensions: BenchmarkDimension[] = [
  {
    key: "structuredOutputValidity",
    name: "Structured-output validity",
    question: "Does every stage produce output that satisfies its schema?",
  },
  {
    key: "retryIdempotencyCorrectness",
    name: "Retry & idempotency correctness",
    question: "Can a failed or cancelled run be retried without corrupting history?",
  },
  {
    key: "endToEndCompletionTime",
    name: "End-to-end completion time",
    question: "How long does a full brief-to-render run take?",
  },
  {
    key: "estimatedVsObservedCost",
    name: "Estimated vs. observed cost",
    question: "Does the pre-run cost estimate match what actually happened?",
  },
  {
    key: "seededFailureRecovery",
    name: "Recovery from seeded failures",
    question: "Does a deliberately broken stage recover cleanly via retry?",
  },
];

export const methodology = {
  summary:
    "Vionto Studio scores a schema-validated, multi-stage AI media pipeline — brief to script to storyboard to asset plan to render — built around an explicit job state machine with human approval gates and idempotent retry. Every generation is a lookup into committed synthetic fixtures; there is no live provider call anywhere in this benchmark.",
  approvalGates:
    "The pipeline will not proceed past script generation or past asset-plan generation without an explicit approve() call. A human can also reject at either gate, which ends the run at 'cancelled' — a legitimate terminal state, not a failure — without losing anything: retrying a cancelled run regenerates only the rejected stage.",
  idempotentRetry:
    "Retry is legal only from 'failed' or 'cancelled' — the engine throws otherwise. Retrying never mutates the original job; it returns a brand-new job with retryCount+1 that resumes at the stage that failed or was rejected, mirroring the legacy render-job retry route's idempotency rule.",
  providers:
    "Only a FixtureProvider is wired up — every script, storyboard, and asset plan is a deterministic lookup into a brief's committed fixture. A LiveProviderStub documents the interface a real adapter would implement, but always throws, even with explicit confirmation: no live provider integration exists in this repo.",
  limitations: [
    "Five hand-authored briefs demonstrate the method — a happy path, a seeded schema failure, a seeded transient render failure, and two human-rejection paths — not statistical significance at scale.",
    "\"Estimated vs. observed\" cost is zero-delta by construction in fixture mode: nothing about a brief varies between estimate-time and generation-time without a live provider. Real variance would only appear once a live adapter is connected.",
    "The fixture renderer produces a structured report and an SVG storyboard strip, not actual video or image encoding — there is no media pipeline behind this benchmark, synthetic or otherwise.",
    "Completion-time and cost figures are representative reference numbers, not live measurements — the engine itself is a pure in-memory reducer and runs in sub-millisecond time.",
  ],
  towardProduction: [
    "Real provider adapters (an LLM for scripts, a render worker for video) implementing the same ScriptProvider/RenderProvider interface, gated behind explicit flags and a cost confirmation step.",
    "Real asset storage, licensing, and rights verification for any non-synthetic media.",
    "Durable queue/worker infrastructure so a job survives a process restart, with the same state machine and idempotent-retry semantics enforced server-side.",
    "Audit logging and access control around who can approve or reject a run at each gate.",
  ],
};
