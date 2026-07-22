import { z } from "zod";
import { PLANNING_LIMITS } from "../constants";
import { ClarificationQuestion, type ClarificationQuestionType } from "./requirementsAnalysis";

export { ClarificationQuestion };
export type { ClarificationQuestionType };

/**
 * An authorized owner/editor's answer to one clarification question.
 * `questionId` must match a question the job actually asked (validated by
 * the pipeline, not by this schema alone) — an answer to an unknown
 * question id is rejected, never silently accepted as new free-form intent
 * outside the original question's scope.
 */
export const ClarificationAnswer = z.object({
  questionId: z.string().min(1).max(64),
  answer: z.string().min(1).max(PLANNING_LIMITS.MAX_CLARIFICATION_ANSWER_LENGTH),
});
export type ClarificationAnswerType = z.infer<typeof ClarificationAnswer>;

/**
 * One full clarification round: the questions asked and (once answered)
 * the answers given. Persisted verbatim on the job row (`clarificationState`)
 * so the full question/answer history survives resume-from-last-safe-state.
 */
export const ClarificationRound = z.object({
  roundNumber: z.number().int().min(1),
  questions: z.array(ClarificationQuestion).max(PLANNING_LIMITS.MAX_CLARIFICATION_QUESTIONS),
  answers: z.array(ClarificationAnswer).default([]),
  askedAt: z.string().datetime(),
  answeredAt: z.string().datetime().optional(),
});
export type ClarificationRoundType = z.infer<typeof ClarificationRound>;

export const ClarificationState = z.object({
  rounds: z.array(ClarificationRound).max(PLANNING_LIMITS.MAX_CLARIFICATION_ROUNDS),
});
export type ClarificationStateType = z.infer<typeof ClarificationState>;

export function isFullyAnswered(round: ClarificationRoundType): boolean {
  const answeredIds = new Set(round.answers.map((a) => a.questionId));
  return round.questions.every((q) => answeredIds.has(q.id));
}
