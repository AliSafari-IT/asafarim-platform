import { describe, expect, it } from "vitest";
import { buildCoverLetterContent, parseCoverLetterSuggestion } from "./schema";

describe("parseCoverLetterSuggestion", () => {
  it("accepts a well-formed suggestion", () => {
    const suggestion = parseCoverLetterSuggestion({
      greeting: "Dear Hiring Manager,",
      paragraphs: ["First paragraph.", "Second paragraph."],
      signOff: "Sincerely,",
    });
    expect(suggestion.paragraphs).toHaveLength(2);
  });

  it("rejects an empty paragraphs array", () => {
    expect(() =>
      parseCoverLetterSuggestion({ greeting: "Dear Hiring Manager,", paragraphs: [], signOff: "Sincerely," }),
    ).toThrow();
  });

  it("rejects more than six paragraphs", () => {
    expect(() =>
      parseCoverLetterSuggestion({
        greeting: "Dear Hiring Manager,",
        paragraphs: Array.from({ length: 7 }, (_, i) => `Paragraph ${i}.`),
        signOff: "Sincerely,",
      }),
    ).toThrow();
  });

  it("rejects a missing greeting", () => {
    expect(() => parseCoverLetterSuggestion({ paragraphs: ["Text."], signOff: "Sincerely," })).toThrow();
  });
});

describe("buildCoverLetterContent", () => {
  it("carries the candidate's own name from code, not from the suggestion", () => {
    const suggestion = parseCoverLetterSuggestion({
      greeting: "Dear Hiring Manager,",
      paragraphs: ["Paragraph."],
      signOff: "Sincerely,",
    });
    const content = buildCoverLetterContent(suggestion, "Jane Doe");
    expect(content.fullName).toBe("Jane Doe");
  });

  it("allows a null name when the profile has none", () => {
    const suggestion = parseCoverLetterSuggestion({
      greeting: "Dear Hiring Manager,",
      paragraphs: ["Paragraph."],
      signOff: "Sincerely,",
    });
    const content = buildCoverLetterContent(suggestion, null);
    expect(content.fullName).toBeNull();
  });
});
