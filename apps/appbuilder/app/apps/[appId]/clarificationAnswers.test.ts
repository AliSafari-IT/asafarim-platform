import { describe, expect, it } from "vitest";
import { ClarificationAnswer } from "@asafarim/appbuilder-ai";
import { SKIPPED_ANSWER, answeredCount, buildAnswerPayload } from "./clarificationAnswers";

const QUESTIONS = [{ id: "q1" }, { id: "q2" }, { id: "q3" }];

describe("buildAnswerPayload", () => {
  it("sends what the user typed, trimmed", () => {
    const payload = buildAnswerPayload(QUESTIONS, { q1: "  Ali Safari  ", q2: "x", q3: "y" });
    expect(payload[0]).toEqual({ questionId: "q1", answer: "Ali Safari" });
  });

  it("answers a skipped question explicitly instead of omitting it", () => {
    // Omission is not an option: a round stays open until it has as many
    // answers as questions, so a dropped entry would leave the form on
    // screen with no way to ever satisfy it.
    const payload = buildAnswerPayload(QUESTIONS, { q1: "answered" });
    expect(payload).toHaveLength(QUESTIONS.length);
    expect(payload[1]).toEqual({ questionId: "q2", answer: SKIPPED_ANSWER });
    expect(payload[2]).toEqual({ questionId: "q3", answer: SKIPPED_ANSWER });
  });

  it("treats whitespace as skipped rather than as an answer", () => {
    // "   " would satisfy min(1) and tell the model nothing.
    const payload = buildAnswerPayload(QUESTIONS, { q1: "   ", q2: "\n\t" });
    expect(payload[0].answer).toBe(SKIPPED_ANSWER);
    expect(payload[1].answer).toBe(SKIPPED_ANSWER);
  });

  it("handles every question being skipped", () => {
    const payload = buildAnswerPayload(QUESTIONS, {});
    expect(payload).toHaveLength(3);
    expect(payload.every((entry) => entry.answer === SKIPPED_ANSWER)).toBe(true);
  });

  it("keeps one entry per question, in the order asked", () => {
    const payload = buildAnswerPayload(QUESTIONS, { q3: "third" });
    expect(payload.map((entry) => entry.questionId)).toEqual(["q1", "q2", "q3"]);
  });

  it("ignores stray answers for questions that were not asked", () => {
    // A stale draft from an earlier round must not smuggle an unknown
    // questionId into the payload — the server rejects the whole submission
    // for one (`Answer references unknown question id`).
    const payload = buildAnswerPayload(QUESTIONS, { q1: "kept", qOld: "from a previous round" });
    expect(payload.map((entry) => entry.questionId)).toEqual(["q1", "q2", "q3"]);
  });

  it("produces entries the server's own schema accepts, including for skips", () => {
    // The real guard against a regression here: `answer` is min(1), so an
    // empty-string skip would be a 400 rather than a submitted form.
    for (const entry of buildAnswerPayload(QUESTIONS, { q1: "answered" })) {
      expect(ClarificationAnswer.safeParse(entry).success).toBe(true);
    }
  });
});

describe("answeredCount", () => {
  it("counts only questions with real content", () => {
    expect(answeredCount(QUESTIONS, {})).toBe(0);
    expect(answeredCount(QUESTIONS, { q1: "  ", q2: "real" })).toBe(1);
    expect(answeredCount(QUESTIONS, { q1: "a", q2: "b", q3: "c" })).toBe(3);
  });
});
