import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../lib/db/testUtils";
import { runEvaluation } from "./runEvaluation";
import { REGRESSION_CORPUS } from "./regressionCorpus";

/**
 * M13 Slice A — "Evaluation baseline" (docs/appbuilder-m13-multimodal-
 * contextual-assistant.md, Delivery slices > A). Runs the reported-
 * conversation regression corpus through the REAL, unmodified
 * `runModificationJob` pipeline, replaying the EXACT ungrounded, generic
 * "too broad" response the original conversation received for every case
 * (`regressionCorpus.ts#tooBroadScript`) — a deterministic fake provider,
 * never grounding (that's `groundedEvaluation.integration.test.ts`).
 *
 * The frozen scenario is the recorded past and must stay reproducible; the
 * shape of ONE assertion here changed with slice E regardless: clarification
 * became a pause rather than a failure PIPELINE-WIDE (lib/modification/
 * pipeline.ts), so even replaying the old dumb refusal now correctly PAUSES
 * the job instead of failing it. Every other metric here is still the
 * pre-grounding baseline slice D/E's real fixes are measured against (see
 * groundedEvaluation.integration.test.ts) — those assertions should start
 * failing only if grounding itself regresses, not from this file.
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

  it("reproduces the reported bug: every case is wrongly asked the same generic, ungrounded question", async () => {
    const report = await runEvaluation(db);

    for (const score of report.cases) {
      // M13 slice E: clarification is a pause, never a failure, even when
      // replaying the exact ungrounded refusal the original bug report
      // received — this is now true pipeline-wide, not something grounding
      // (slice D) or a specific fixture script needs to opt into.
      expect(score.actualJobStatus, `case ${score.caseId}`).toBe("needs_clarification");
      expect(score.actualFailureCode, `case ${score.caseId}`).toBeNull();
      // None of these seven requests actually needed a clarifying question
      // under the M13 product contract — today's ungrounded baseline asks
      // one anyway (that's the bug slice D's grounding fixes).
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
