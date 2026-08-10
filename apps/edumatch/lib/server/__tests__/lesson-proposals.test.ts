import { describe, expect, it, vi } from "vitest";

vi.mock("@asafarim/db", () => ({ prisma: {}, Prisma: {} }));
vi.mock("../audit", () => ({ recordEduAuditEvent: vi.fn() }));
vi.mock("../notifications", () => ({ notifyStudentOfQuoteSubmitted: vi.fn() }));

import {
  DEFAULT_CANCELLATION_POLICY,
  blendResponseTime,
  buildPlanOutline,
  buildPreparationNotes,
  buildProposalDraft,
  computeEarliestStart,
} from "../lesson-proposals";
import type { BriefFields } from "../learning-brief";

const BRIEF: BriefFields = {
  subject: "Mathematics",
  topic: "Quadratic equations",
  educationalLevel: "K12",
  learningObjective: "Pass the exam",
  currentUnderstanding: "I know the formula but freeze on word problems",
  difficulties: ["turning a word problem into an equation"],
  prerequisiteGaps: ["factorising"],
  language: "nl",
  mode: "IN_PERSON",
};

const TUTOR = {
  hourlyRateCents: 3000,
  onlineOnly: false,
  languagesTaught: ["nl", "en"],
};

describe("buildPlanOutline", () => {
  it("produces exactly one step per proposed session", () => {
    expect(buildPlanOutline(BRIEF, 4)).toHaveLength(4);
    expect(buildPlanOutline(BRIEF, 1)).toHaveLength(1);
  });

  it("tackles prerequisite gaps before the topic itself", () => {
    const steps = buildPlanOutline(BRIEF, 4);
    expect(steps[0].focus).toContain("factorising");
  });

  it("ends on exam practice when the deadline is an exam", () => {
    const steps = buildPlanOutline({ ...BRIEF, deadlineKind: "EXAM" }, 3);
    expect(steps[2].focus.toLowerCase()).toContain("exam");
  });

  it("ends on consolidation when there is no exam", () => {
    const steps = buildPlanOutline(BRIEF, 3);
    expect(steps[2].focus.toLowerCase()).toContain("consolidate");
  });

  it("still produces a usable plan when nothing specific is known", () => {
    const steps = buildPlanOutline({ subject: "Physics" }, 2);
    expect(steps).toHaveLength(2);
    expect(steps[0].focus.length).toBeGreaterThan(0);
    expect(steps[0].outcome.length).toBeGreaterThan(0);
  });

  it("gives every step a stated outcome, so progress has something to track", () => {
    for (const step of buildPlanOutline(BRIEF, 5)) {
      expect(step.outcome.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("buildPreparationNotes", () => {
  it("quotes the student's own words back to the tutor", () => {
    expect(buildPreparationNotes(BRIEF)).toContain("freeze on word problems");
  });

  it("flags prerequisite gaps to check before the first session", () => {
    expect(buildPreparationNotes(BRIEF)).toContain("factorising");
  });

  it("surfaces accessibility needs", () => {
    const notes = buildPreparationNotes({
      ...BRIEF,
      accessibilityNeeds: "dyslexia — needs extra reading time",
    });
    expect(notes).toContain("dyslexia");
  });
});

describe("computeEarliestStart", () => {
  const monday = new Date("2026-08-10T09:00:00Z"); // a Monday

  it("never proposes same-day, even when the student is free today", () => {
    const start = computeEarliestStart(
      { availability: [{ day: "MON", from: "16:00", to: "18:00" }] },
      monday,
    );
    expect(start.getTime()).toBeGreaterThan(monday.getTime());
    expect(start.getDate()).not.toBe(monday.getDate());
  });

  it("lands on the student's next free window", () => {
    const start = computeEarliestStart(
      {
        availability: [
          { day: "WED", from: "16:00", to: "18:00" },
          { day: "SAT", from: "10:00", to: "12:00" },
        ],
      },
      monday,
    );
    expect(start.getDay()).toBe(3); // Wednesday
  });

  it("falls back to two days out when availability is unknown", () => {
    const start = computeEarliestStart({}, monday);
    const days = Math.round(
      (start.getTime() - monday.getTime()) / (24 * 60 * 60 * 1000),
    );
    expect(days).toBe(2);
  });
});

describe("buildProposalDraft", () => {
  it("prices the whole plan from the tutor's own hourly rate", () => {
    const draft = buildProposalDraft(
      { ...BRIEF, estimatedSessions: 4, sessionMinutes: 60 },
      TUTOR,
    );
    expect(draft.totalCents).toBe(4 * 3000); // 4 hours at €30
  });

  it("honours the brief's own session estimate when it has one", () => {
    const draft = buildProposalDraft(
      { ...BRIEF, estimatedSessions: 7, sessionMinutes: 90 },
      TUTOR,
    );
    expect(draft.sessionCount).toBe(7);
    expect(draft.sessionMinutes).toBe(90);
  });

  it("resolves an ambiguous format to something concrete for comparison", () => {
    expect(buildProposalDraft({ ...BRIEF, mode: "EITHER" }, TUTOR).mode).toBe(
      "ONLINE",
    );
    expect(buildProposalDraft(BRIEF, TUTOR).mode).toBe("IN_PERSON");
  });

  it("falls back to online when the brief wants in-person but the tutor doesn't travel", () => {
    const draft = buildProposalDraft(BRIEF, { ...TUTOR, onlineOnly: true });
    expect(draft.mode).toBe("ONLINE");
  });

  it("picks the tutor's matching teaching language", () => {
    expect(buildProposalDraft(BRIEF, TUTOR).language).toBe("nl");
  });

  it("defaults to the moderate cancellation policy", () => {
    expect(buildProposalDraft(BRIEF, TUTOR).cancellationPolicy).toBe(
      DEFAULT_CANCELLATION_POLICY,
    );
  });

  it("produces a plan the student can read before paying", () => {
    const draft = buildProposalDraft(
      { ...BRIEF, estimatedSessions: 3 },
      TUTOR,
    );
    expect(draft.planOutline).toHaveLength(3);
    expect(draft.preparationNotes.length).toBeGreaterThan(0);
  });
});

describe("blendResponseTime", () => {
  it("takes the first observation as-is", () => {
    expect(blendResponseTime(null, 45)).toBe(45);
  });

  it("moves toward the new observation without jumping to it", () => {
    const next = blendResponseTime(100, 200);
    expect(next).toBeGreaterThan(100);
    expect(next).toBeLessThan(200);
  });

  it("is stable under a repeated identical observation", () => {
    expect(blendResponseTime(60, 60)).toBe(60);
  });
});
