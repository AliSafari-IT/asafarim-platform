import type { ApplicationSpecificationType } from "@asafarim/appbuilder-schema";
import type { RequirementsAnalysisType } from "../schemas/requirementsAnalysis";
import { PLANNING_LIMITS } from "../constants";
import { COMPONENT_CONFIG_GUIDE } from "./componentConfigGuide";

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
  const consumesWholeBudget = batchCap > 0 && batchCap === input.remainingOperationBudget;
  sections.push(
    input.remainingOperationBudget <= 0
      ? "The operation budget for this job is exhausted. Return an empty-safe final batch describing nothing further, with isFinalBatch=true."
      : `Propose the next batch of operations (only from the allowed operation schema) that moves the specification closer to the normalized requirements. This batch MUST contain at most ${batchCap} operations — if the requirements need more than that in total, propose only the highest-priority ${batchCap} now (e.g. core entities/pages first) and set isFinalBatch=false so a later iteration can add the rest; do not try to fit everything into one oversized batch, and never exceed the limit.${
          consumesWholeBudget
            ? ` This batch uses the ENTIRE remaining operation budget (${input.remainingOperationBudget}) — there will be no further iteration no matter what you set isFinalBatch to, so you MUST set isFinalBatch=true here even if the app is not yet fully complete.`
            : " Set isFinalBatch=true only once the app is reasonably complete for its stated purpose."
        }`,
  );
  sections.push(
    "Every response MUST also include `reasoningSummary` (one sentence — your internal justification for this batch, distinct from any per-operation detail).",
  );
  sections.push(COMPONENT_CONFIG_GUIDE);
  sections.push(
    "Every `id`/`machineName` you CREATE (a new entity/field/page/component/role/workflow/etc.) MUST match exactly this pattern: " +
      "lowercase letters, digits, underscore, or hyphen, starting with a letter (e.g. `about_section`, `contact-form`, `project_link`) " +
      "— never spaces, capital letters, or punctuation outside `_`/`-`. Derive it by lowercasing the display name and replacing " +
      'spaces/other characters with underscores ("About Section" -> "about_section"). This applies to every stable id you create, ' +
      "not just top-level ones.\n\n" +
      "This does NOT apply to ids REFERENCING something that already exists (e.g. `entityId` on ADD_FIELD, `pageId`/`componentId` on " +
      "UPDATE_COMPONENT): those MUST be copied character-for-character from the CURRENT SPECIFICATION STATE above — never re-derived " +
      "from a display name, which may not match the entity/page's actual stored id.",
  );

  return sections.join("\n\n");
}
