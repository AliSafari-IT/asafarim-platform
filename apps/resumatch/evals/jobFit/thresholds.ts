import type { Metrics } from "./run";

/**
 * Release thresholds for the AI job fit (#971), set before any prompt
 * tuning and judged on the held-out split only. A real-provider run that
 * misses one is a no-go: the feature keeps the labelled keyword analysis
 * as its only method until a run passes and a person has reviewed the
 * replies (README.md).
 *
 * Why these numbers:
 * - Extraction recall 0.9: the old line-based extractor misses whole
 *   requirements (0.57 held out); the AI must not.
 * - Judgment accuracy 0.8 against labels that already allow the defensible
 *   alternatives (direct or partial for a transferable skill, unknown or
 *   partial for a near miss).
 * - False support 0.05: saying "you have this" without evidence is the
 *   costliest error, so it is capped tighter than accuracy.
 * - Unknown as unmet 0 and number without basis 0: hard product rules.
 * - Score in range 0.7: ranges are wide; most cases must land in them.
 * - Failures 0.1, cost and latency: the analysis is a click the candidate
 *   waits on.
 */
export const RELEASE_THRESHOLDS = {
  extractionRecall: 0.9,
  judgmentAccuracy: 0.8,
  falseSupportRate: 0.05,
  unknownAsUnmetRate: 0,
  boilerplateExtracted: 0,
  scoreInRangeRate: 0.7,
  suitabilityAccuracy: 0.8,
  numberWithoutBasis: 0,
  failureRate: 0.1,
  meanCostUsd: 0.01,
  p95LatencyMs: 25_000,
} as const;

export interface ReleaseCheck {
  name: string;
  value: number | null;
  limit: number;
  pass: boolean;
}

export function checkRelease(model: Metrics, ops: { failureRate: number; meanCostUsd: number; p95LatencyMs: number }): ReleaseCheck[] {
  const t = RELEASE_THRESHOLDS;
  const atLeast = (name: string, value: number | null, limit: number): ReleaseCheck => ({ name, value, limit, pass: value === null || value >= limit });
  const atMost = (name: string, value: number, limit: number): ReleaseCheck => ({ name, value, limit, pass: value <= limit });
  return [
    atLeast("extractionRecall", model.extractionRecall, t.extractionRecall),
    atLeast("judgmentAccuracy", model.judgmentAccuracy, t.judgmentAccuracy),
    atMost("falseSupportRate", model.falseSupportRate, t.falseSupportRate),
    atMost("unknownAsUnmetRate", model.unknownAsUnmetRate, t.unknownAsUnmetRate),
    atMost("boilerplateExtracted", model.boilerplateExtracted, t.boilerplateExtracted),
    atLeast("scoreInRangeRate", model.scoreInRangeRate, t.scoreInRangeRate),
    atLeast("suitabilityAccuracy", model.suitabilityAccuracy, t.suitabilityAccuracy),
    atMost("numberWithoutBasis", model.numberWithoutBasis, t.numberWithoutBasis),
    atMost("failureRate", ops.failureRate, t.failureRate),
    atMost("meanCostUsd", ops.meanCostUsd, t.meanCostUsd),
    atMost("p95LatencyMs", ops.p95LatencyMs, t.p95LatencyMs),
  ];
}
