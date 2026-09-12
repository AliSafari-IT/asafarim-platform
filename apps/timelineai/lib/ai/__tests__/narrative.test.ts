import { describe, expect, it } from "vitest";
import { extractFactualAnchors, preservesFactualAnchors } from "../narrative";

describe("extractFactualAnchors", () => {
  it("extracts years, URLs, and uncertainty markers", () => {
    const anchors = extractFactualAnchors(
      "Founded circa 2019, see https://example.com/history for more, launched in 2021."
    );
    expect(anchors.years).toEqual(["2019", "2021"]);
    expect(anchors.urls).toEqual(["https://example.com/history"]);
    expect(anchors.uncertaintyMarkers).toContain("circa");
  });

  it("returns empty arrays for plain text with no anchors", () => {
    const anchors = extractFactualAnchors("A short story with no specific facts.");
    expect(anchors.years).toEqual([]);
    expect(anchors.urls).toEqual([]);
    expect(anchors.uncertaintyMarkers).toEqual([]);
  });
});

describe("preservesFactualAnchors", () => {
  it("passes when a stylistic rewrite keeps the same years and URL", () => {
    const original = "The company launched in 2021, see https://example.com for details.";
    const rewritten = "In a bold move in 2021, they launched — full story at https://example.com.";
    expect(preservesFactualAnchors(original, rewritten)).toBe(true);
  });

  it("fails when a rewrite drops a year", () => {
    const original = "Founded in 2019, acquired in 2022.";
    const rewritten = "Founded in 2019, later acquired.";
    expect(preservesFactualAnchors(original, rewritten)).toBe(false);
  });

  it("fails when a rewrite drops a cited URL", () => {
    const original = "Read more at https://example.com/report.";
    const rewritten = "Read the full report for more details.";
    expect(preservesFactualAnchors(original, rewritten)).toBe(false);
  });

  it("fails when a rewrite drops hedging language, turning an approximate date into an implied exact one", () => {
    const original = "The battle occurred circa 1200 BCE.";
    const rewritten = "The battle occurred in 1200 BCE.";
    expect(preservesFactualAnchors(original, rewritten)).toBe(false);
  });

  it("passes when a rewrite keeps different but equivalent hedging language", () => {
    const original = "The event happened approximately in the 1990s.";
    const rewritten = "The event reportedly took place sometime in the 1990s.";
    expect(preservesFactualAnchors(original, rewritten)).toBe(true);
  });
});
