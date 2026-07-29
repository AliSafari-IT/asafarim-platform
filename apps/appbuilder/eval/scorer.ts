import type { ModificationProposalType } from "@asafarim/appbuilder-ai";
import type { RegressionCase } from "./regressionCorpus";

/**
 * M13 Slice A scoring — the five metrics named in the milestone doc's
 * "Delivery slices" section A and mirrored by the release targets table.
 * A metric is `null` on a given case when it does not apply (e.g. target
 * accuracy cannot be scored once the job never reached a proposal at all).
 * Rates in `EvaluationReport.summary` are computed only over cases where the
 * metric applies, so a corpus dominated by one scenario shape doesn't dilute
 * the others.
 */
export interface CaseScore {
  caseId: string;
  /** Did clarificationNeeded match what the M13 product contract actually requires for this request? */
  clarificationCorrect: boolean;
  targetAccuracy: boolean | null;
  operationValidity: number | null;
  planCompletion: boolean | null;
  capabilityTruthfulness: boolean | null;
  actualJobStatus: string;
  actualFailureCode: string | null;
}

export interface EvaluationSummary {
  totalCases: number;
  clarificationPrecisionRate: number;
  targetAccuracyRate: number | null;
  operationValidityRate: number | null;
  planCompletionRate: number | null;
  capabilityTruthfulnessRate: number | null;
}

export interface EvaluationReport {
  generatedAt: string;
  cases: CaseScore[];
  summary: EvaluationSummary;
}

export interface ScoredJobOutcome {
  status: string;
  failureCode: string | null;
}

export function scoreCase(regressionCase: RegressionCase, proposal: ModificationProposalType, job: ScoredJobOutcome): CaseScore {
  const clarificationCorrect = proposal.clarificationNeeded === regressionCase.expected.questionNeeded;
  const reachedProposal = !proposal.clarificationNeeded;

  const targetAccuracy = reachedProposal && regressionCase.expected.matchesTarget
    ? regressionCase.expected.matchesTarget(proposal.batch.operations)
    : null;

  const operationValidity = reachedProposal ? 1 : null;

  const planCompletion = regressionCase.expected.requiresPlan
    ? reachedProposal && proposal.batch.operations.length > 0
    : null;

  // No `capability_notice` outcome exists in the schema yet (that lands in
  // M13 slice E) — until then, an owed disclosure is never actually made,
  // so this is always false where applicable. Kept as its own metric (not
  // folded into clarificationCorrect) so slice E's fix is visible as a
  // change to THIS number specifically.
  const capabilityTruthfulness = regressionCase.expected.requiresCapabilityDisclosure ? false : null;

  return {
    caseId: regressionCase.id,
    clarificationCorrect,
    targetAccuracy,
    operationValidity,
    planCompletion,
    capabilityTruthfulness,
    actualJobStatus: job.status,
    actualFailureCode: job.failureCode,
  };
}

function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function rateOfApplicable(scores: CaseScore[], pick: (s: CaseScore) => boolean | number | null): number | null {
  const applicable = scores.map(pick).filter((v): v is boolean | number => v !== null);
  if (applicable.length === 0) return null;
  const sum = applicable.reduce((acc: number, v) => acc + (typeof v === "boolean" ? (v ? 1 : 0) : v), 0);
  return rate(sum, applicable.length);
}

export function summarize(scores: CaseScore[]): EvaluationSummary {
  return {
    totalCases: scores.length,
    clarificationPrecisionRate: rate(scores.filter((s) => s.clarificationCorrect).length, scores.length) ?? 0,
    targetAccuracyRate: rateOfApplicable(scores, (s) => s.targetAccuracy),
    operationValidityRate: rateOfApplicable(scores, (s) => s.operationValidity),
    planCompletionRate: rateOfApplicable(scores, (s) => s.planCompletion),
    capabilityTruthfulnessRate: rateOfApplicable(scores, (s) => s.capabilityTruthfulness),
  };
}
