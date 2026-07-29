import type { ApplicationSpecificationType } from "@asafarim/appbuilder-schema";

export interface RepairPromptInput {
  failureClassification: string;
  targetGateKeys: readonly string[];
  diagnosticsSummary: Record<string, unknown>;
  currentSpec: ApplicationSpecificationType;
  operationBudget: number;
}

/**
 * Builds the user-role message for a single M10 repair request. Unlike
 * buildModificationPrompt.ts, there is no free-text user request to wrap as
 * untrusted input here — the only input is server-derived structured
 * diagnostics (already redacted by lib/validation/redaction.ts before this
 * is ever called), so everything is included as plain JSON.
 */
export function buildRepairPrompt(input: RepairPromptInput): string {
  const sections = [
    `FAILED VALIDATION GATE(S): ${input.targetGateKeys.join(", ")}`,
    `FAILURE CLASSIFICATION: ${input.failureClassification}`,
    `OPERATION BUDGET: at most ${input.operationBudget} operation(s) in this proposal.`,
    `DIAGNOSTICS (bounded, redacted evidence — never raw logs/secrets):\n${JSON.stringify(input.diagnosticsSummary, null, 2)}`,
    `CURRENT SPECIFICATION (entities/pages/roles/permissions/workflows already present — only propose what changes):\n${JSON.stringify(
      {
        entities: input.currentSpec.entities,
        pages: input.currentSpec.pages,
        roles: input.currentSpec.roles,
        permissions: input.currentSpec.permissions,
        workflows: input.currentSpec.workflows,
      },
      null,
      2,
    )}`,
    "Propose a single bounded operation batch that fixes the failing gate(s) above, using ONLY the allowlisted operation vocabulary already available to you. If this failure cannot be fixed within that vocabulary (e.g. it requires a capability this platform does not support, or is not actually a specification problem), set repairable=false, return an empty operations array, and explain why in `summary`. Never claim the fix has been applied or that validation will now pass — you only propose; revalidation happens separately after a human confirms any destructive change.\n\n" +
      "Every response MUST include all of these fields, even though this is a single one-shot repair, not a multi-batch job: `batch.reasoningSummary` (one sentence — your internal justification, distinct from the user-facing `summary`) and `batch.isFinalBatch` (always `true` here — there is no follow-up batch for a single repair).",
  ];

  return sections.join("\n\n");
}
