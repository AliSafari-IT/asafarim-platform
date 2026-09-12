import { describe, expect, it } from "vitest";
import { recommendVisualDirections, type ContentSummary } from "../visual-director";
import { checkVisualAccessibility } from "../visual-accessibility";

function content(overrides: Partial<ContentSummary> = {}): ContentSummary {
  return { eventCount: 12, hasDurations: false, hasManyBranches: false, avgDescriptionLength: 50, ...overrides };
}

describe("recommendVisualDirections", () => {
  it("returns 2-3 candidates for typical content", () => {
    const candidates = recommendVisualDirections(content());
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates.length).toBeLessThanOrEqual(3);
  });

  it("is deterministic — same input, same output, every call", () => {
    const input = content({ eventCount: 25, hasDurations: true });
    const a = recommendVisualDirections(input);
    const b = recommendVisualDirections(input);
    expect(a).toEqual(b);
  });

  it("recommends gantt for duration-heavy content", () => {
    const candidates = recommendVisualDirections(content({ hasDurations: true, hasManyBranches: false }));
    expect(candidates[0]!.layout).toBe("gantt");
  });

  it("recommends roadmap when the content has many branches", () => {
    const candidates = recommendVisualDirections(content({ hasManyBranches: true }));
    expect(candidates[0]!.layout).toBe("roadmap");
  });

  it("falls back to vertical for plain content", () => {
    const candidates = recommendVisualDirections(content({ hasDurations: false, hasManyBranches: false }));
    expect(candidates[0]!.layout).toBe("vertical");
  });

  it("every returned candidate passes the accessibility check", () => {
    for (const eventCount of [3, 12, 50, 90]) {
      const candidates = recommendVisualDirections(content({ eventCount }));
      for (const c of candidates) {
        const violations = checkVisualAccessibility({
          backgroundId: c.backgroundId,
          accentId: c.accentId,
          layout: c.layout,
          density: c.density,
          eventCount: c.inputsUsed.eventCount,
        });
        expect(violations).toHaveLength(0);
      }
    }
  });

  it("echoes the inputs used, for reproducibility/explainability", () => {
    const input = content({ eventCount: 30, hasDurations: true, avgDescriptionLength: 300 });
    const candidates = recommendVisualDirections(input);
    for (const c of candidates) {
      expect(c.inputsUsed).toEqual(input);
      expect(c.rationale.length).toBeGreaterThan(0);
    }
  });

  it("picks compact density for many events and spacious for few", () => {
    const many = recommendVisualDirections(content({ eventCount: 60 }));
    const few = recommendVisualDirections(content({ eventCount: 3 }));
    expect(many[0]!.density).toBe("compact");
    expect(few[0]!.density).toBe("spacious");
  });

  it("includes at least one dark-theme (midnight) candidate", () => {
    const candidates = recommendVisualDirections(content());
    expect(candidates.some((c) => c.backgroundId === "midnight")).toBe(true);
  });
});
