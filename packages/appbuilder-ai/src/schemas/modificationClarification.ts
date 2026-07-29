import { z } from "zod";
import { PLANNING_LIMITS } from "../constants";

/**
 * M13 slice E — resumable clarification for a single conversational
 * modification job. A deliberately SEPARATE shape from
 * schemas/clarification.ts's `ClarificationRound`/`ClarificationState`
 * (M07's multi-question, multi-round generation clarification): a
 * modification job asks at most one question per round, and every answer
 * choice is addressed by a stable specification target where the resolver
 * could find one — free text is the fallback, never the only option, so a
 * choice-driven answer can be turned straight back into a preview-selection-
 * shaped target for the next interpretation pass instead of being
 * re-parsed as prose.
 */

export const ModificationClarificationChoice = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(200),
  /** Stable specification address (see specIndex.ts's targetId convention), when this choice names a concrete target. */
  targetId: z.string().max(200).optional(),
});
export type ModificationClarificationChoiceType = z.infer<typeof ModificationClarificationChoice>;

export const ModificationClarificationQuestion = z.object({
  id: z.string().min(1).max(64),
  text: z.string().min(1).max(500),
  /** Two to five grounded choices (M13 doc, "Clarification state") — never a single "yes" or an open-ended void. */
  choices: z.array(ModificationClarificationChoice).min(2).max(5),
  allowFreeText: z.boolean().default(true),
});
export type ModificationClarificationQuestionType = z.infer<typeof ModificationClarificationQuestion>;

export const ModificationClarificationAnswer = z.object({
  questionId: z.string().min(1).max(64),
  choiceId: z.string().min(1).max(64).optional(),
  freeText: z.string().min(1).max(PLANNING_LIMITS.MAX_CLARIFICATION_ANSWER_LENGTH).optional(),
  answeredAt: z.string().datetime(),
  answeredByPrincipalId: z.string().min(1),
});
export type ModificationClarificationAnswerType = z.infer<typeof ModificationClarificationAnswer>;

/**
 * One full round: the question asked, the exact specification version it
 * was grounded against (`contextVersion` — re-checked on answer submission
 * so a stale round fails safe instead of silently answering a
 * since-changed question), its expiry, and (once answered) the answer.
 */
export const ModificationClarificationRound = z.object({
  roundNumber: z.number().int().min(1).max(2),
  question: ModificationClarificationQuestion,
  contextVersion: z.number().int().min(0),
  askedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  answer: ModificationClarificationAnswer.optional(),
});
export type ModificationClarificationRoundType = z.infer<typeof ModificationClarificationRound>;

/** At most two rounds per job (M13 doc: "Allow at most two rounds per plan"). */
export const ModificationClarificationState = z.object({
  rounds: z.array(ModificationClarificationRound).max(2),
});
export type ModificationClarificationStateType = z.infer<typeof ModificationClarificationState>;

export function currentClarificationRound(
  state: ModificationClarificationStateType | null | undefined,
): ModificationClarificationRoundType | null {
  if (!state || state.rounds.length === 0) return null;
  const last = state.rounds[state.rounds.length - 1];
  return last.answer ? null : last;
}

export function isClarificationExpired(round: ModificationClarificationRoundType, now: Date = new Date()): boolean {
  return new Date(round.expiresAt).getTime() <= now.getTime();
}
