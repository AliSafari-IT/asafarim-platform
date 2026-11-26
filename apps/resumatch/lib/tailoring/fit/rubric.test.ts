import { describe, expect, it } from "vitest";
import type { FitCategory, FitJudgment, FitPriority } from "./contract";
import { scoreFit, type FitRow } from "./rubric";

function row(id: string, priority: FitPriority, judgment: FitJudgment, extra: { category?: FitCategory; essential?: boolean; groupId?: string; removed?: boolean; protectedTrait?: boolean } = {}): FitRow {
  return {
    requirement: {
      id,
      quote: id,
      priority,
      category: extra.category ?? "skill",
      essential: extra.essential ?? false,
      groupId: extra.groupId ?? null,
      protectedTrait: extra.protectedTrait ?? false,
    },
    assessment: { requirementId: id, judgment, citations: [], explanation: "", equivalence: null, flags: [] },
    removed: extra.removed ?? false,
    priorityCorrectedFrom: null,
    answeredBy: null,
  };
}

const score = (rows: FitRow[], profileTooThin = false) => scoreFit(rows, { profileTooThin });

describe("fit rubric (#971)", () => {
  it("the documented worked example: weights 3/2/1, half credit for partial, unknown stays in the denominator", () => {
    const s = score([
      row("a", "required", "direct"),
      row("b", "required", "direct"),
      row("c", "required", "partial"),
      row("d", "required", "unknown"),
      row("e", "preferred", "direct"),
      row("f", "unclear", "unmet"),
    ]);
    // possible 3+3+3+3+1+2 = 15; earned 3+3+1.5+0+1+0 = 8.5 → 56.67 → 57
    expect(s.possible).toBe(15);
    expect(s.earned).toBe(8.5);
    expect(s.percent).toBe(57);
    expect(s.band).toBe("partial");
    // known weight 12 of 15 = 80%
    expect(s.completeness).toBe(80);
    expect(s.sufficiency).toBe("good");
    expect(s.counts).toEqual({ direct: 3, partial: 1, unknown: 1, unmet: 1, conflict: 0 });
  });

  it("unknown requirements can only lower the score, never inflate it", () => {
    const known = score([row("a", "required", "direct"), row("b", "required", "direct"), row("c", "required", "direct")]);
    const withUnknown = score([row("a", "required", "direct"), row("b", "required", "direct"), row("c", "required", "direct"), row("d", "required", "unknown")]);
    expect(known.percent).toBe(100);
    expect(withUnknown.percent).toBe(75);
    expect(withUnknown.completeness).toBe(75);
  });

  it("the denominator is the job's requirements: the candidate's other skills play no part", () => {
    // There is no input for candidate skills at all: only requirement rows count.
    const s = score([row("a", "required", "direct"), row("b", "preferred", "unknown"), row("c", "required", "direct")]);
    expect(s.possible).toBe(7);
  });

  it("an OR group counts once, by its best member", () => {
    const s = score([
      row("java", "required", "unknown", { groupId: "g1" }),
      row("csharp", "required", "direct", { groupId: "g1" }),
      row("sql", "required", "direct"),
      row("git", "required", "direct"),
    ]);
    expect(s.units).toHaveLength(3);
    expect(s.percent).toBe(100);
  });

  it("partial support never counts as a mandatory credential or language level", () => {
    const s = score([
      row("licence", "required", "partial", { category: "credential", essential: true }),
      row("a", "required", "direct"),
      row("b", "required", "direct"),
    ]);
    expect(s.earned).toBe(6);
    expect(s.suitability.items).toEqual([{ requirementId: "licence", status: "needs_confirmation" }]);
    expect(s.suitability.overall).toBe("needs_confirmation");
  });

  it("an unmet essential condition stays prominent even with a high score", () => {
    const rows = [
      row("onsite", "required", "unmet", { category: "work_arrangement", essential: true }),
      ...["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => row(id, "required", "direct")),
    ];
    const s = score(rows);
    expect(s.percent).toBe(89);
    expect(s.suitability.overall).toBe("unmet_essential");
    expect(s.lowFit).toBe(true);
    expect(s.lowFitReason).toBe("essential_unmet");
    expect(s.gaps[0]).toBe("onsite");
  });

  it("unknown is never 'not met' for suitability", () => {
    const s = score([row("permit", "required", "unknown", { category: "authorization", essential: true }), row("a", "required", "direct"), row("b", "required", "direct")]);
    expect(s.suitability.overall).toBe("needs_confirmation");
    expect(s.lowFit).toBe(false);
  });

  it("suppresses the percentage for sparse input instead of showing 0%", () => {
    expect(score([row("a", "required", "direct"), row("b", "required", "unknown")]).suppressed).toBe("too_few_requirements");
    const unknowns = score([row("a", "required", "unknown"), row("b", "required", "unknown"), row("c", "required", "unknown"), row("d", "preferred", "direct")]);
    expect(unknowns.suppressed).toBe("too_little_known");
    expect(unknowns.percent).toBeNull();
    expect(score([row("a", "required", "direct"), row("b", "required", "direct"), row("c", "required", "direct")], true).suppressed).toBe("profile_too_thin");
  });

  it("warns before tailoring an off-scope job where nothing is supported", () => {
    const s = score([row("a", "required", "unknown"), row("b", "required", "unknown"), row("c", "required", "unknown")]);
    expect(s.lowFitReason).toBe("nothing_supported");
  });

  it("warns on a low match only when enough is known", () => {
    const low = score([row("a", "required", "unmet"), row("b", "required", "unmet"), row("c", "required", "direct"), row("d", "required", "conflict")]);
    expect(low.percent).toBe(25);
    expect(low.lowFitReason).toBe("low_match");
  });

  it("removed and protected-trait requirements are shown but never scored", () => {
    const s = score([
      row("a", "required", "direct"),
      row("b", "required", "direct"),
      row("c", "required", "direct"),
      row("age", "required", "unknown", { protectedTrait: true }),
      row("x", "required", "unknown", { removed: true }),
    ]);
    expect(s.percent).toBe(100);
    expect(s.units).toHaveLength(3);
  });

  it("rounds half up", () => {
    // unclear partial (1) + preferred partial (0.5) = 1.5 of 4 = 37.5% → 38%
    const s = score([row("a", "unclear", "partial"), row("b", "preferred", "partial"), row("c", "preferred", "unknown")]);
    expect(s.earned).toBe(1.5);
    expect(s.possible).toBe(4);
    expect(s.percent).toBe(38);
  });
});
