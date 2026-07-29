import { describe, it, expect } from "vitest";
import {
  ModificationClarificationRound,
  ModificationClarificationState,
  currentClarificationRound,
  isClarificationExpired,
} from "./modificationClarification";

const question = {
  id: "q1",
  text: "Which page did you mean?",
  choices: [
    { id: "c1", label: "Home", targetId: "pages.home.name" },
    { id: "c2", label: "Marketing Home", targetId: "pages.home_marketing.name" },
  ],
  allowFreeText: true,
};

function round(overrides: Record<string, unknown> = {}) {
  return ModificationClarificationRound.parse({
    roundNumber: 1,
    question,
    contextVersion: 4,
    askedAt: "2026-07-29T10:00:00.000Z",
    expiresAt: "2026-07-29T10:15:00.000Z",
    ...overrides,
  });
}

describe("ModificationClarificationState", () => {
  it("caps rounds at two", () => {
    const parsed = ModificationClarificationState.safeParse({
      rounds: [round({ roundNumber: 1 }), round({ roundNumber: 2 }), round({ roundNumber: 2 })],
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts an empty rounds list", () => {
    expect(ModificationClarificationState.safeParse({ rounds: [] }).success).toBe(true);
  });
});

describe("currentClarificationRound", () => {
  it("returns null when there are no rounds", () => {
    expect(currentClarificationRound({ rounds: [] })).toBeNull();
  });

  it("returns the last round when it has no answer yet", () => {
    const r = round();
    expect(currentClarificationRound({ rounds: [r] })?.roundNumber).toBe(1);
  });

  it("returns null once the last round has an answer", () => {
    const answered = round({
      answer: { questionId: "q1", choiceId: "c1", answeredAt: "2026-07-29T10:05:00.000Z", answeredByPrincipalId: "user-1" },
    });
    expect(currentClarificationRound({ rounds: [answered] })).toBeNull();
  });
});

describe("isClarificationExpired", () => {
  it("is false before the expiry timestamp", () => {
    const r = round({ expiresAt: "2026-07-29T10:15:00.000Z" });
    expect(isClarificationExpired(r, new Date("2026-07-29T10:10:00.000Z"))).toBe(false);
  });

  it("is true at or after the expiry timestamp", () => {
    const r = round({ expiresAt: "2026-07-29T10:15:00.000Z" });
    expect(isClarificationExpired(r, new Date("2026-07-29T10:15:00.000Z"))).toBe(true);
    expect(isClarificationExpired(r, new Date("2026-07-29T10:20:00.000Z"))).toBe(true);
  });
});
