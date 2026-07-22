import type { ApplicationSpecificationType } from "@asafarim/appbuilder-schema";
import type { RequirementsAnalysisType } from "../schemas/requirementsAnalysis";

export interface OperationPromptInput {
  analysis: RequirementsAnalysisType;
  templateId: string;
  currentSpec: ApplicationSpecificationType;
  priorBatchSummaries: readonly string[];
  remainingOperationBudget: number;
  iteration: number;
  maxIterations: number;
}

/**
 * Builds the user-role message for one operation-proposal iteration.
 * Entirely built from already-validated structured data — the normalized
 * requirements this pipeline produced, and the current specification state
 * (itself only ever the output of the controlled operation engine). No raw
 * untrusted user text reaches this step.
 */
export function buildOperationPrompt(input: OperationPromptInput): string {
  const sections = [
    `TEMPLATE APPLIED: ${input.templateId}`,
    `ITERATION ${input.iteration} of ${input.maxIterations} (remaining operation budget: ${input.remainingOperationBudget})`,
    `NORMALIZED REQUIREMENTS:\n${JSON.stringify(input.analysis, null, 2)}`,
    `CURRENT SPECIFICATION STATE (entities/pages/roles already present — do not recreate them, only add what's missing):\n${JSON.stringify(
      { entities: input.currentSpec.entities, pages: input.currentSpec.pages, roles: input.currentSpec.roles },
      null,
      2,
    )}`,
  ];

  if (input.priorBatchSummaries.length > 0) {
    sections.push(`PRIOR ITERATIONS THIS JOB:\n${input.priorBatchSummaries.map((s, i) => `${i + 1}. ${s}`).join("\n")}`);
  }

  sections.push(
    input.remainingOperationBudget <= 0
      ? "The operation budget for this job is exhausted. Return an empty-safe final batch describing nothing further, with isFinalBatch=true."
      : "Propose the next bounded batch of operations (only from the allowed operation schema) that moves the specification closer to the normalized requirements. Set isFinalBatch=true only once the app is reasonably complete for its stated purpose.",
  );

  return sections.join("\n\n");
}
