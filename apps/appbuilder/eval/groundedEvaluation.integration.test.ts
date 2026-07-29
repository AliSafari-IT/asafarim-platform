import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../lib/db/testUtils";
import { runGroundedEvaluation } from "./runEvaluation";
import type { CaseScore } from "./scorer";

/**
 * M13 slices D+E measured on slice A's corpus: the same seven reported-
 * conversation cases, the same unmodified `runModificationJob`, with
 * grounding (slice D) and the ModificationDecision outcome contract
 * (slice E — needs_clarification/partially_supported/unsupported,
 * multi-step plans, capability disclosure) both switched on.
 *
 * This harness scores a SINGLE provider call per case — it cannot exercise
 * slice E's resumable, multi-turn clarification mechanic (a real answer
 * round-trip; see lib/modification/groundedPipeline.integration.test.ts's
 * "duplicate matches" suite for that) or drive a multi-step plan past its
 * first step (see lib/modification/modificationPlan.integration.test.ts).
 * What it CAN measure here: a decision's outcome/shape on the first call,
 * and whether the job that first call started reached a truthful status.
 *
 * The point of asserting what remains unfixed as loudly as what's fixed:
 * this file is what stops slice E from being reported as more complete than
 * it is. Public URL/GitHub import and real multimodal image understanding
 * are slice F/G, and are still visibly absent here.
 */
const db = getTestDb();

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

function byId(cases: readonly CaseScore[], id: string): CaseScore {
  const found = cases.find((c) => c.caseId === id);
  if (!found) throw new Error(`no score recorded for case "${id}"`);
  return found;
}

describe("M13 slices D+E — grounded run of the regression corpus", () => {
  it("resolves and applies the cases slice D is responsible for", async () => {
    const report = await runGroundedEvaluation(db);

    for (const id of ["rename_home_title", "title_color_blue", "title_value_home", "selector_still_black"]) {
      const score = byId(report.cases, id);
      expect(score.actualJobStatus, `case ${id}`).toBe("ready");
      expect(score.actualFailureCode, `case ${id}`).toBeNull();
      // No question was needed for any of these under the M13 product
      // contract, and none is asked any more.
      expect(score.clarificationCorrect, `case ${id}`).toBe(true);
    }
  });

  it("hits the expected specification target where the corpus pins one", async () => {
    const report = await runGroundedEvaluation(db);

    // "replace the title Home to Experiences" → the only page titled "Home".
    expect(byId(report.cases, "rename_home_title").targetAccuracy).toBe(true);
    // "change the title color to blue" → branding.primaryColor, the only
    // colour-valued property this schema can express.
    expect(byId(report.cases, "title_color_blue").targetAccuracy).toBe(true);
    expect(report.summary.targetAccuracyRate).toBe(1);
  });

  it("proposes only schema-valid operations on every case that reaches a proposal", async () => {
    const report = await runGroundedEvaluation(db);
    expect(report.summary.operationValidityRate).toBe(1);
  });

  it("moves unnecessary clarification off the 100% baseline", async () => {
    const report = await runGroundedEvaluation(db);
    // Baseline (eval/evaluation.integration.test.ts) is 0 — every case
    // wrongly asked a question.
    expect(report.summary.clarificationPrecisionRate).toBeGreaterThanOrEqual(5 / 7);
  });

  it("stages the landing-page brief into a plan and discloses its capability gaps honestly (slice E)", async () => {
    const report = await runGroundedEvaluation(db);
    const brief = byId(report.cases, "landing_page_brief");

    expect(brief.actualJobStatus).toBe("ready");
    expect(brief.actualFailureCode).toBeNull();
    // The decision was partially_supported with a real multi-step plan, not
    // a refusal — see modificationPlan.integration.test.ts for the same
    // scenario driven all the way through every step.
    expect(brief.planCompletion).toBe(true);
    expect(brief.capabilityTruthfulness).toBe(true);
    expect(report.summary.planCompletionRate).toBe(1);
  });

  it("pauses rather than fails on the cases slice E's clarification/plan work does not fully resolve in a single call", async () => {
    const report = await runGroundedEvaluation(db);

    // "at the page level" answers a pending question this single-call
    // harness never asked — resuming it for real is
    // groundedPipeline.integration.test.ts's job. What slice E DID fix here:
    // this used to be a hard `failed` job; it is now a resumable pause.
    expect(byId(report.cases, "resume_page_level").actualJobStatus).toBe("needs_clarification");
    expect(byId(report.cases, "resume_page_level").actualFailureCode).toBeNull();

    // The screenshot case still has no image evidence reaching a model
    // (multimodal provider calls are not built yet) — also now a pause
    // asking what to change, rather than a failure.
    expect(byId(report.cases, "screenshot_make_blue").actualJobStatus).toBe("needs_clarification");
    expect(byId(report.cases, "screenshot_make_blue").actualFailureCode).toBeNull();

    // Capability disclosure is now real (landing_page_brief), but not every
    // case the corpus marks as "should disclose" does — e.g. a reversible
    // presentation default like mapping "blue" onto the app palette is
    // stated as an assumption in prose, not a structured capability gap,
    // which this metric does not currently credit. Honestly short of 100%,
    // tracked rather than hidden.
    expect(report.summary.capabilityTruthfulnessRate).toBeGreaterThan(0);
    expect(report.summary.capabilityTruthfulnessRate).toBeLessThan(1);
  });

  it("never asks a question that blames the request for being too broad, and never fails silently", async () => {
    const report = await runGroundedEvaluation(db);
    for (const score of report.cases) {
      expect(
        score.actualFailureCode === null || score.actualFailureCode === "invalid_request",
        `case ${score.caseId}`,
      ).toBe(true);
    }
  });
});
