import type { RequirementsAnalysisType } from "../schemas/requirementsAnalysis";

export interface TemplatePromptInput {
  analysis: RequirementsAnalysisType;
  availableTemplates: ReadonlyArray<{ id: string; displayName: string; description: string }>;
  requestedStarterFamily: string;
}

/**
 * Builds the user-role message for template selection. Entirely built from
 * already-validated structured data (the RequirementsAnalysis this
 * pipeline produced itself, and the server-authored template catalog) —
 * there is no raw untrusted text in this step, since the analysis phase
 * already normalized the user's free text into a bounded structured shape.
 */
export function buildTemplatePrompt(input: TemplatePromptInput): string {
  const catalog = input.availableTemplates
    .map((t) => `- id: ${t.id}\n  name: ${t.displayName}\n  description: ${t.description}`)
    .join("\n");

  return [
    `AVAILABLE TEMPLATES (select templateId from this list ONLY):\n${catalog}`,
    `USER-REQUESTED STARTER FAMILY: ${input.requestedStarterFamily}`,
    `NORMALIZED REQUIREMENTS:\n${JSON.stringify(input.analysis, null, 2)}`,
    "Select the single best-fitting templateId and explain briefly why. If the user-requested starter family is already the best fit, prefer it.",
  ].join("\n\n");
}
