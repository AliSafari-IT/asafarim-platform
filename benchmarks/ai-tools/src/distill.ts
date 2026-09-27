/**
 * The compact, client-safe view of a report that Showcase renders (#683).
 * Scores and versions only: no inputs, outputs, prompts, or provider data.
 */
import type { EvalReport } from "./evaluate";
import { THRESHOLDS } from "./thresholds";

export interface DistilledEvalReport {
  reportVersion: 1;
  mode: "fixture";
  notice: string;
  rubricVersion: string;
  thresholds: Record<string, number>;
  tools: {
    slug: string;
    toolVersion: string;
    schemaVersion: string;
    promptVersion: string | null;
    datasetVersion: string;
    cases: number;
    kinds: string[];
    summary: EvalReport["tools"][number]["summary"];
    guardrails: { id: string; failure: string; expected: string; outcome: string; passed: boolean }[];
  }[];
}

export function distill(report: EvalReport): DistilledEvalReport {
  return {
    reportVersion: 1,
    mode: report.mode,
    notice: report.notice,
    rubricVersion: report.rubricVersion,
    thresholds: { ...THRESHOLDS },
    tools: report.tools.map((t) => ({
      slug: t.slug,
      toolVersion: t.toolVersion,
      schemaVersion: t.schemaVersion,
      promptVersion: t.promptVersion,
      datasetVersion: t.datasetVersion,
      cases: t.cases.length,
      kinds: t.kindsCovered,
      summary: t.summary,
      guardrails: t.adversarial.map(({ id, failure, expected, outcome, passed }) => ({ id, failure, expected, outcome, passed })),
    })),
  };
}
