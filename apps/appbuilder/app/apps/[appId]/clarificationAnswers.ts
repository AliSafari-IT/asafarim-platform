"use client";

/**
 * Turning the clarification form's state into the payload the API accepts.
 *
 * Every question here is optional to answer. That is a product decision, not
 * a shortcut: M13's contract is that clarification exists to resolve a real
 * ambiguity, never to gate progress ("'Broad' alone is never a rejection
 * reason"). A user who genuinely has no opinion on the palette, or who does
 * not want a public contact email at all, had no way to proceed — every
 * field was required, so one blank box disabled Submit entirely.
 *
 * Skipping cannot be expressed by omission, for two independent reasons:
 *
 * 1. `ClarificationAnswer.answer` is `z.string().min(1)`
 *    (@asafarim/appbuilder-ai), so an empty string is a 400.
 * 2. A round is considered still-open until it has as many answers as
 *    questions (see GenerationStatusPanel's `openRound`, and
 *    `submitClarificationAnswers`, which stores the array verbatim).
 *    Dropping a skipped question would leave the form on screen forever,
 *    with no way to ever satisfy it.
 *
 * So a skipped question is answered explicitly, with a sentence that says
 * exactly what happened. That is also the better prompt: a question that
 * simply vanished invites the model to ask it again next round, whereas
 * "the user was asked and declined to specify" is a fact it can act on.
 */

/** What a skipped question sends. Phrased as a statement of what the user did, never as an invented preference. */
export const SKIPPED_ANSWER = "No preference given — use your best judgement for this.";

export interface ClarificationQuestionLike {
  id: string;
}

export interface AnswerPayloadEntry {
  questionId: string;
  answer: string;
}

/**
 * One entry per question, in the order asked. Whitespace-only input counts
 * as skipped — a stray space is not an answer, and sending one would both
 * pass `min(1)` and tell the model nothing.
 */
export function buildAnswerPayload(
  questions: readonly ClarificationQuestionLike[],
  answers: Record<string, string>
): AnswerPayloadEntry[] {
  return questions.map((question) => {
    const given = (answers[question.id] ?? "").trim();
    return { questionId: question.id, answer: given.length > 0 ? given : SKIPPED_ANSWER };
  });
}

/** How many of the asked questions the user actually answered — drives the "you skipped N" hint, not validation. */
export function answeredCount(
  questions: readonly ClarificationQuestionLike[],
  answers: Record<string, string>
): number {
  return questions.filter((q) => (answers[q.id] ?? "").trim().length > 0).length;
}
