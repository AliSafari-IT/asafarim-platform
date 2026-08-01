import type { ApplicationSpecificationType } from "@asafarim/appbuilder-schema";
import type { RequirementsAnalysisType } from "../schemas/requirementsAnalysis";
import { PLANNING_LIMITS } from "../constants";

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

  const batchCap = Math.min(input.remainingOperationBudget, PLANNING_LIMITS.MAX_OPERATIONS_PER_BATCH);
  sections.push(
    input.remainingOperationBudget <= 0
      ? "The operation budget for this job is exhausted. Return an empty-safe final batch describing nothing further, with isFinalBatch=true."
      : `Propose the next batch of operations (only from the allowed operation schema) that moves the specification closer to the normalized requirements. This batch MUST contain at most ${batchCap} operations — if the requirements need more than that in total, propose only the highest-priority ${batchCap} now (e.g. core entities/pages first) and set isFinalBatch=false so a later iteration can add the rest; do not try to fit everything into one oversized batch, and never exceed the limit. Set isFinalBatch=true only once the app is reasonably complete for its stated purpose.`,
  );
  sections.push(
    "Every response MUST also include `reasoningSummary` (one sentence — your internal justification for this batch, distinct from any per-operation detail).",
  );
  sections.push(
    "Every `id` and `machineName` on every entity/field/page/component/role/workflow/etc. you create or reference MUST match exactly " +
      "this pattern: lowercase letters, digits, underscore, or hyphen, starting with a letter (e.g. `about_section`, `contact-form`, " +
      "`project_link`) — never spaces, capital letters, or punctuation outside `_`/`-`. Derive it by lowercasing the display name and " +
      "replacing spaces/other characters with underscores (\"About Section\" -> \"about_section\"). This applies to every stable id in " +
      "the operation, not just top-level ones.",
  );

  return sections.join("\n\n");
}
