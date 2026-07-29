import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../lib/db/testUtils";
import { runGroundedEvaluation } from "./runEvaluation";
import type { CaseScore } from "./scorer";

/**
 * M13 slice D measured on slice A's corpus: the same seven reported-
 * conversation cases, the same unmodified `runModificationJob`, but with
 * grounding switched on — spec index, deterministic target resolution,
 * verified memory, bounded context — instead of replaying the recorded
 * "too broad" refusal.
 *
 * The point of asserting the *unfixed* cases as loudly as the fixed ones:
 * this file is what stops slice D from being reported as more complete than
 * it is. Staged plans, clarification resume, and capability notices are
 * slices E and F, and they are still visibly failing here.
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

describe("M13 slice D — grounded run of the regression corpus", () => {
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
    // wrongly asked a question. The remaining gap to the ≤5%-unnecessary
    // release target is slices E and F.
    expect(report.summary.clarificationPrecisionRate).toBeGreaterThanOrEqual(4 / 7);
  });

  it("leaves the slice E/F cases honestly unfixed", async () => {
    const report = await runGroundedEvaluation(db);

    // A staged, capability-assessed plan for the landing-page brief needs
    // multi-step plans (slice E) — there is still no plan to complete.
    expect(report.summary.planCompletionRate).toBe(0);

    // "at the page level" is an answer to a pending question, and there is
    // still no clarification state for it to resume (slice E).
    expect(byId(report.cases, "resume_page_level").actualJobStatus).toBe("failed");

    // The screenshot case still has no image evidence reaching a model
    // (multimodal provider calls are not built yet).
    expect(byId(report.cases, "screenshot_make_blue").actualJobStatus).toBe("failed");

    // `partially_supported` / `unsupported` outcomes do not exist in the
    // decision schema until slice E, so no capability gap is ever disclosed.
    expect(report.summary.capabilityTruthfulnessRate).toBe(0);
  });

  it("never asks a question that blames the request for being too broad", async () => {
    const report = await runGroundedEvaluation(db);
    for (const score of report.cases) {
      expect(score.actualFailureCode === null || score.actualFailureCode === "invalid_request").toBe(true);
    }
  });
});
