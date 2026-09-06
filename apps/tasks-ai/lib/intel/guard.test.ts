import { describe, expect, it } from "vitest";
import { assertNoSurveillance, SurveillanceGuardError } from "./guard";

describe("assertNoSurveillance", () => {
  it("passes a normal focus payload", () => {
    expect(() =>
      assertNoSurveillance({
        items: [{ task: { id: "t", title: "Draft brief" }, score: 42, factors: [{ factor: "urgency", because: "due in 1d" }] }],
      }),
    ).not.toThrow();
  });

  it("rejects a per-person productivity score key", () => {
    expect(() => assertNoSurveillance({ users: [{ id: "u", productivityScore: 0.8 }] })).toThrow(
      SurveillanceGuardError,
    );
    expect(() => assertNoSurveillance({ score_per_user: {} })).toThrow(SurveillanceGuardError);
  });

  it("rejects emotion / sentiment fields", () => {
    expect(() => assertNoSurveillance({ member: { sentiment: "negative" } })).toThrow();
    expect(() => assertNoSurveillance({ mood: "stressed" })).toThrow();
  });

  it("rejects judgemental phrases in strings", () => {
    expect(() => assertNoSurveillance({ note: "Ana is a top performer this sprint" })).toThrow();
    expect(() => assertNoSurveillance({ summary: "Bo is underperforming" })).toThrow();
  });

  it("walks nested arrays and objects", () => {
    expect(() =>
      assertNoSurveillance({ a: { b: [{ c: [{ performanceRating: 3 }] }] } }),
    ).toThrow(SurveillanceGuardError);
  });
});
