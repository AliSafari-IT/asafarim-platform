import type { ApplicationSpecificationType } from "@asafarim/appbuilder-schema";
import type { ModificationSelectionContext } from "../provider/types";
import { wrapUntrustedInput } from "./systemPolicy";

export interface ModificationPromptInput {
  userRequest: string;
  currentSpec: ApplicationSpecificationType;
  selection: ModificationSelectionContext | null;
  operationBudget: number;
}

/**
 * Builds the user-role message for a single conversational modification
 * request. The free-text request is the only untrusted input here — it is
 * always wrapped via wrapUntrustedInput (see prompts/systemPolicy.ts),
 * exactly like buildAnalysisPrompt.ts does for the initial generation
 * prompt. The current specification and selection context are
 * server-derived structured data, not user-authored text, so they are
 * included as plain JSON rather than wrapped as untrusted input.
 */
export function buildModificationPrompt(input: ModificationPromptInput): string {
  const sections = [
    wrapUntrustedInput("user request", input.userRequest),
    `OPERATION BUDGET: at most ${input.operationBudget} operation(s) in this proposal.`,
    `CURRENT SPECIFICATION (entities/pages/roles/permissions already present — only propose what changes):\n${JSON.stringify(
      {
        entities: input.currentSpec.entities,
        pages: input.currentSpec.pages,
        roles: input.currentSpec.roles,
        permissions: input.currentSpec.permissions,
      },
      null,
      2,
    )}`,
  ];

  if (input.selection) {
    sections.push(
      `SELECTED PREVIEW ELEMENT (the user picked this before asking — prefer scoping your change to it when the request is about "this"/"here"):\n${JSON.stringify(
        input.selection,
        null,
        2,
      )}`,
    );
  }

  sections.push(
    "Propose a single bounded batch answering exactly this request. If the request is too ambiguous to act on safely, set clarificationNeeded=true, return an empty operations array, and explain what you need in `summary`. Never claim the change has been applied — you only propose.",
  );

  return sections.join("\n\n");
}
