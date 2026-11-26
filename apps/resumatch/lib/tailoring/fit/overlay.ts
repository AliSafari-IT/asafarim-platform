import type { FitAnalysis, FitAnswer, FitAssessmentItem, FitCorrection, FitPriority } from "./contract";
import type { FitRow } from "./rubric";

/**
 * The candidate's own input on top of a stored analysis (#971), applied in
 * code on every read, so an answer or a correction updates the same
 * assessment at once and costs no AI call.
 *
 * - "No, I don't have this": the requirement is unmet, by the candidate's
 *   word. If a source supported it, it is a conflict for them to resolve.
 * - "Yes": only once confirmed, and only as saved evidence. It becomes a
 *   direct citation of that evidence (the candidate's own words).
 * - A correction of a misread requirement (priority, or "not a
 *   requirement") keeps the original and the change, so its provenance
 *   stays visible. The latest correction per requirement wins; "restore"
 *   undoes it.
 */

export function latestCorrections(corrections: FitCorrection[]): Map<string, FitCorrection> {
  const latest = new Map<string, FitCorrection>();
  for (const c of [...corrections].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))) {
    if (c.action === "restore") latest.delete(c.requirementId);
    else latest.set(c.requirementId, c);
  }
  return latest;
}

export function latestAnswers(answers: FitAnswer[]): Map<string, FitAnswer> {
  const latest = new Map<string, FitAnswer>();
  for (const a of [...answers].sort((x, y) => x.createdAt.localeCompare(y.createdAt) || x.id.localeCompare(y.id))) latest.set(a.requirementId, a);
  return latest;
}

export function applyOverlay(analysis: FitAnalysis, answers: FitAnswer[], corrections: FitCorrection[]): FitRow[] {
  const answerBy = latestAnswers(answers);
  const correctionBy = latestCorrections(corrections);
  const assessmentBy = new Map(analysis.assessments.map((a) => [a.requirementId, a]));
  return analysis.requirements.map((original) => {
    const correction = correctionBy.get(original.id);
    let priorityCorrectedFrom: FitPriority | null = null;
    let requirement = original;
    if (correction?.action === "priority" && correction.priority && correction.priority !== original.priority) {
      priorityCorrectedFrom = original.priority;
      requirement = { ...original, priority: correction.priority };
    }
    let assessment: FitAssessmentItem = assessmentBy.get(original.id) ?? {
      requirementId: original.id,
      judgment: "unknown",
      citations: [],
      explanation: "",
      equivalence: null,
      flags: ["not_assessed"],
    };
    const answer = answerBy.get(original.id);
    let answeredBy: FitRow["answeredBy"] = null;
    if (answer?.answer === "no") {
      answeredBy = "no";
      const supported = assessment.judgment === "direct" || assessment.judgment === "partial";
      assessment = {
        ...assessment,
        judgment: supported ? "conflict" : "unmet",
        citations: [...(supported ? assessment.citations : []), { sourceId: `answer:${answer.id}`, quote: "No" }],
        equivalence: supported ? assessment.equivalence : null,
      };
    } else if (answer?.answer === "yes" && answer.evidenceRevisionId && answer.evidenceText) {
      answeredBy = "yes";
      assessment = {
        ...assessment,
        judgment: "direct",
        citations: [{ sourceId: `ev:${answer.evidenceRevisionId}`, quote: answer.evidenceText.slice(0, 300) }],
        equivalence: null,
        flags: [],
      };
    }
    return { requirement, assessment, removed: correction?.action === "not_requirement", priorityCorrectedFrom, answeredBy };
  });
}
