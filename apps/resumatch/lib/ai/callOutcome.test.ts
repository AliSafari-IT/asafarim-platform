import { describe, expect, it } from "vitest";
import { errorCodeOf } from "./callOutcome";
import { summarizeOutcomes } from "./callOutcomeReport";

describe("errorCodeOf", () => {
  it("prefers an identifier-like code, then reason, then the class name", () => {
    expect(errorCodeOf(Object.assign(new Error("x"), { code: "ETIMEDOUT" }))).toBe("ETIMEDOUT");
    expect(errorCodeOf(Object.assign(new Error("x"), { reason: "monthly_budget_exceeded" }))).toBe(
      "monthly_budget_exceeded",
    );
    expect(errorCodeOf(new TypeError("boom"))).toBe("TypeError");
  });

  it("never returns free text or a message", () => {
    const err = Object.assign(new Error("Bearer sk-secret leaked"), { code: "has spaces and stuff" });
    expect(errorCodeOf(err)).toBe("Error");
    expect(errorCodeOf("plain string error")).toBe("unknown");
    expect(errorCodeOf({ code: 429 })).toBe("unknown");
    expect(errorCodeOf(Object.assign(new Error("x"), { code: "A".repeat(65) }))).toBe("Error");
  });
});

describe("summarizeOutcomes", () => {
  it("computes per-kind rates and average attempts", () => {
    const rows = summarizeOutcomes([
      { kind: "tailor", outcome: "success", usedFallback: false, calls: 6, attemptsSum: 8 },
      { kind: "tailor", outcome: "success", usedFallback: true, calls: 1, attemptsSum: 2 },
      { kind: "tailor", outcome: "exhausted", usedFallback: false, calls: 2, attemptsSum: 6 },
      { kind: "tailor", outcome: "budget_refused", usedFallback: false, calls: 1, attemptsSum: 0 },
      { kind: "extract", outcome: "success", usedFallback: false, calls: 3, attemptsSum: 3 },
    ]);
    expect(rows).toEqual([
      {
        kind: "extract",
        calls: 3,
        successRate: 1,
        degradeRate: 0,
        fallbackRate: 0,
        avgAttempts: 1,
        byOutcome: { success: 3 },
      },
      {
        kind: "tailor",
        calls: 10,
        successRate: 0.7,
        degradeRate: 0.3,
        fallbackRate: 0.1,
        avgAttempts: 1.6,
        byOutcome: { success: 7, exhausted: 2, budget_refused: 1 },
      },
    ]);
  });

  it("rounds rates and ignores empty buckets", () => {
    const [row] = summarizeOutcomes([
      { kind: "rewrite", outcome: "success", usedFallback: false, calls: 2, attemptsSum: 2 },
      { kind: "rewrite", outcome: "non_retryable", usedFallback: false, calls: 1, attemptsSum: 1 },
      { kind: "ghost", outcome: "success", usedFallback: false, calls: 0, attemptsSum: 0 },
    ]);
    expect(row).toMatchObject({ kind: "rewrite", calls: 3, successRate: 0.6667, degradeRate: 0.3333 });
    expect(summarizeOutcomes([])).toEqual([]);
  });
});
