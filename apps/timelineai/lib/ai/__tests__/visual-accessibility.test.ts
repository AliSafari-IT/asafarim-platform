import { describe, expect, it } from "vitest";
import { checkVisualAccessibility, contrastRatio, VISUAL_DIRECTOR_ACCENTS, VISUAL_DIRECTOR_BACKGROUNDS } from "../visual-accessibility";

describe("contrastRatio", () => {
  it("is 21:1 for black on white", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
  });

  it("is 1:1 for identical colors", () => {
    expect(contrastRatio("#3730A3", "#3730A3")).toBeCloseTo(1, 5);
  });

  it("is symmetric regardless of argument order", () => {
    expect(contrastRatio("#3730A3", "#FAFAF7")).toBeCloseTo(contrastRatio("#FAFAF7", "#3730A3"), 5);
  });
});

describe("checkVisualAccessibility", () => {
  const base = { layout: "vertical", eventCount: 10 };

  it("passes a dark accent on the light 'paper' background", () => {
    expect(checkVisualAccessibility({ ...base, backgroundId: "paper", accentId: "indigo" })).toHaveLength(0);
  });

  it("passes a light accent on the dark 'midnight' background", () => {
    expect(checkVisualAccessibility({ ...base, backgroundId: "midnight", accentId: "indigo-light" })).toHaveLength(0);
  });

  it("rejects a dark accent on the dark background (insufficient contrast)", () => {
    const violations = checkVisualAccessibility({ ...base, backgroundId: "midnight", accentId: "indigo" });
    expect(violations.some((v) => v.code === "insufficient_contrast")).toBe(true);
  });

  it("rejects a light accent on the light background (insufficient contrast)", () => {
    const violations = checkVisualAccessibility({ ...base, backgroundId: "paper", accentId: "indigo-light" });
    expect(violations.some((v) => v.code === "insufficient_contrast")).toBe(true);
  });

  it("rejects an unknown color token rather than guessing a fallback", () => {
    const violations = checkVisualAccessibility({ ...base, backgroundId: "paper", accentId: "hot-pink-9000" });
    expect(violations.some((v) => v.code === "unknown_color_token")).toBe(true);
  });

  it("flags compact density with a large event count as an overflow risk", () => {
    const violations = checkVisualAccessibility({
      ...base,
      backgroundId: "paper",
      accentId: "indigo",
      density: "compact",
      eventCount: 150,
    });
    expect(violations.some((v) => v.code === "density_overflow_risk")).toBe(true);
  });

  it("does not flag compact density for a small event count", () => {
    const violations = checkVisualAccessibility({
      ...base,
      backgroundId: "paper",
      accentId: "indigo",
      density: "compact",
      eventCount: 5,
    });
    expect(violations).toHaveLength(0);
  });

  it("every declared background/accent token pair that shares a light/dark role passes", () => {
    for (const accent of VISUAL_DIRECTOR_ACCENTS.filter((a) => !a.id.endsWith("-light"))) {
      expect(checkVisualAccessibility({ ...base, backgroundId: "paper", accentId: accent.id })).toHaveLength(0);
    }
    for (const accent of VISUAL_DIRECTOR_ACCENTS.filter((a) => a.id.endsWith("-light"))) {
      expect(checkVisualAccessibility({ ...base, backgroundId: "midnight", accentId: accent.id })).toHaveLength(0);
    }
    expect(VISUAL_DIRECTOR_BACKGROUNDS.length).toBeGreaterThanOrEqual(2);
  });
});
