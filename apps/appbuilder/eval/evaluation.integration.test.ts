import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../lib/db/testUtils";
import { runEvaluation } from "./runEvaluation";
import { REGRESSION_CORPUS } from "./regressionCorpus";

/**
 * M13 Slice A — "Evaluation baseline" (docs/appbuilder-m13-multimodal-
 * contextual-assistant.md, Delivery slices > A). Runs the reported-
 * conversation regression corpus through the REAL, unmodified
 * `runModificationJob` pipeline via a deterministic fake provider and
 * asserts today's known-bad baseline. This is the pre-fix snapshot the doc
 * calls for: every assertion here should start FAILING once slices D/E land
 * real target resolution, clarification-resume, and capability notices —
 * that's the signal this corpus is doing its job, not a regression.
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

describe("M13 slice A — regression corpus baseline", () => {
  it("covers every acceptance scenario in the M13 doc", () => {
    const ids = REGRESSION_CORPUS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate case ids
    expect(REGRESSION_CORPUS.length).toBe(7);
  });

  it("reproduces the reported failure: every case is wrongly rejected as invalid_request today", async () => {
    const report = await runEvaluation(db);

    for (const score of report.cases) {
      expect(score.actualJobStatus, `case ${score.caseId}`).toBe("failed");
      expect(score.actualFailureCode, `case ${score.caseId}`).toBe("invalid_request");
      // None of these seven requests actually needed a clarifying question
      // under the M13 product contract — today's pipeline asks one anyway.
      expect(score.clarificationCorrect, `case ${score.caseId}`).toBe(false);
    }
  });

  it("records the current (pre-fix) baseline scores", async () => {
    const report = await runEvaluation(db);

    // Unnecessary clarification: 100% of this corpus, against a ≤5%
    // release target (docs "Quality and safety gates" table) — the gap
    // slices D/E close.
    expect(report.summary.clarificationPrecisionRate).toBe(0);

    // Nothing ever reaches a proposal today, so target/operation accuracy
    // isn't measurable yet — both metrics stay null rather than a
    // misleading 0 or 1 until a target is actually resolved.
    expect(report.summary.targetAccuracyRate).toBeNull();
    expect(report.summary.operationValidityRate).toBeNull();

    // The one multi-stage-plan case (the landing-page brief) never
    // produces a plan today.
    expect(report.summary.planCompletionRate).toBe(0);

    // No case discloses an honest partial-support/unsupported gap today —
    // the outcome type to do so doesn't exist until slice E.
    expect(report.summary.capabilityTruthfulnessRate).toBe(0);
  });
});
