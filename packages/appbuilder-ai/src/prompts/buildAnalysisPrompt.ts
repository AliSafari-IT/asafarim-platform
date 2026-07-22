import { PLANNING_LIMITS } from "../constants";
import { wrapUntrustedInput } from "./systemPolicy";
import type { ClarificationRoundType } from "../schemas/clarification";

export interface AnalysisPromptInput {
  prompt: string;
  requestedStarterFamily: string;
  clarificationHistory: readonly ClarificationRoundType[];
  availableTemplateIds: readonly string[];
}

/**
 * Builds the trusted user-role message for the requirements-analysis step.
 * Only the `prompt` and clarification answers are untrusted content —
 * everything else here (template ids, structure, instructions) is
 * server-authored. Truncates the prompt defensively even though the
 * caller is expected to have already enforced PLANNING_LIMITS.MAX_PROMPT_LENGTH
 * at the API boundary — never trust a single enforcement point.
 */
export function buildAnalysisPrompt(input: AnalysisPromptInput): string {
  const boundedPrompt = input.prompt.slice(0, PLANNING_LIMITS.MAX_PROMPT_LENGTH);

  const sections = [
    `ALLOWED TEMPLATES: ${input.availableTemplateIds.join(", ")}`,
    `USER-REQUESTED STARTER FAMILY: ${input.requestedStarterFamily}`,
    wrapUntrustedInput("original business request", boundedPrompt),
  ];

  if (input.clarificationHistory.length > 0) {
    const history = input.clarificationHistory
      .map((round) => {
        const qa = round.answers
          .map((a) => {
            const question = round.questions.find((q) => q.id === a.questionId);
            const boundedAnswer = a.answer.slice(0, PLANNING_LIMITS.MAX_CLARIFICATION_ANSWER_LENGTH);
            return `Q: ${question?.question ?? a.questionId}\nA: ${boundedAnswer}`;
          })
          .join("\n\n");
        return `Round ${round.roundNumber}:\n${qa}`;
      })
      .join("\n\n");
    sections.push(wrapUntrustedInput("clarification answers", history));
  }

  sections.push(
    "Produce a RequirementsAnalysis. Only ask clarification questions for information you genuinely cannot proceed without.",
  );

  return sections.join("\n\n");
}
