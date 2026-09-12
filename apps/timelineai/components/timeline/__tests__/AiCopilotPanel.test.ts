import { describe, expect, it } from "vitest";
import { summarizePayload, hasUncitedContent } from "../AiCopilotPanel";
import type { AiProposalPayload } from "@/lib/ai/schemas";

const eventsExtraction: AiProposalPayload = {
  kind: "events_extraction",
  events: [
    { title: "First", confidence: "high", citations: [{ label: "Source" }], uncitedInference: false },
    { title: "Second", confidence: "medium", citations: [], uncitedInference: true },
  ],
};

const narrativeSuggestion: AiProposalPayload = {
  kind: "narrative_suggestion",
  field: "description",
  element: "field_rewrite",
  suggestedText: "A rewritten description of what happened here.",
  variants: [],
  confidence: "medium",
  unsupportedClaim: false,
};

const visualRecommendation: AiProposalPayload = {
  kind: "visual_recommendation",
  candidates: [
    {
      layout: "vertical",
      backgroundId: "canvas",
      accentId: "indigo",
      density: "comfortable",
      cardStyle: "flat",
      rationale: "Clean and legible for a general audience.",
    },
    {
      layout: "horizontal",
      backgroundId: "midnight",
      accentId: "violet",
      density: "compact",
      cardStyle: "elevated",
      rationale: "Denser, for many events.",
    },
  ],
  recommendedIndex: 0,
  confidence: "medium",
};

const temporalCorrection: AiProposalPayload = {
  kind: "temporal_correction",
  eventId: "evt-1",
  temporalValue: { precision: "year", era: "CE", year: 1990, displayText: "1990" },
  citations: [],
  confidence: "low",
  uncitedInference: true,
  conflictCodes: [],
};

describe("summarizePayload", () => {
  it("summarizes an events_extraction payload with a count and titles", () => {
    expect(summarizePayload(eventsExtraction)).toContain("2 events");
    expect(summarizePayload(eventsExtraction)).toContain("First");
  });

  it("summarizes a narrative_suggestion payload with its target and text", () => {
    expect(summarizePayload(narrativeSuggestion)).toContain("timeline's description");
    expect(summarizePayload(narrativeSuggestion)).toContain("A rewritten description");
  });

  it("summarizes a visual_recommendation payload using the recommended candidate", () => {
    expect(summarizePayload(visualRecommendation)).toContain("vertical layout");
    expect(summarizePayload(visualRecommendation)).toContain("Clean and legible");
  });

  it("summarizes a temporal_correction payload with the interpreted date", () => {
    expect(summarizePayload(temporalCorrection)).toBe("Interpreted as: 1990");
  });
});

describe("hasUncitedContent", () => {
  it("flags events_extraction when any event is an uncited inference", () => {
    expect(hasUncitedContent(eventsExtraction)).toBe(true);
    expect(hasUncitedContent({ ...eventsExtraction, events: [eventsExtraction.events[0]!] })).toBe(false);
  });

  it("flags temporal_correction from its own uncitedInference flag", () => {
    expect(hasUncitedContent(temporalCorrection)).toBe(true);
    expect(hasUncitedContent({ ...temporalCorrection, uncitedInference: false })).toBe(false);
  });

  it("flags narrative_suggestion from unsupportedClaim", () => {
    expect(hasUncitedContent({ ...narrativeSuggestion, unsupportedClaim: true })).toBe(true);
    expect(hasUncitedContent(narrativeSuggestion)).toBe(false);
  });

  it("never flags visual_recommendation, which carries no factual claims", () => {
    expect(hasUncitedContent(visualRecommendation)).toBe(false);
  });
});
