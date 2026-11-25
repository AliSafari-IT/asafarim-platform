import { describe, expect, it } from "vitest";
import { MAX_DRAFT_REVIEW_BYTES, parseDraftUpdate, parseStoredOptions, type DraftOptions } from "./contract";

const options: DraftOptions = {
  cvLanguage: "en",
  instructions: "Emphasize my backend work",
  includeCoverLetter: true,
  coverLetterTone: "formal",
  coverLetterLength: "standard",
  coverLetterLanguage: null,
  savedNotesOff: false,
  lowFitConfirmed: false,
  unmetRequirementIds: ["req:1"],
};

describe("Tailor draft contract", () => {
  it("accepts an options draft and a review draft", () => {
    expect(parseDraftUpdate({ step: "options", options, previewId: null, review: null }).ok).toBe(true);
    expect(
      parseDraftUpdate({ step: "review", options, previewId: "pv_1", review: { targetJobId: "tj_1", headline: "x" } }).ok,
    ).toBe(true);
  });

  it("refuses a review step without its preview or review, and a review on the options step", () => {
    expect(parseDraftUpdate({ step: "review", options, previewId: null, review: { a: 1 } }).ok).toBe(false);
    expect(parseDraftUpdate({ step: "review", options, previewId: "pv_1", review: null }).ok).toBe(false);
    expect(parseDraftUpdate({ step: "options", options, previewId: null, review: { a: 1 } }).ok).toBe(false);
  });

  it("refuses free text where a closed choice belongs, and unknown fields", () => {
    expect(parseDraftUpdate({ step: "options", options: { ...options, coverLetterTone: "sarcastic" }, previewId: null, review: null }).ok).toBe(false);
    expect(parseDraftUpdate({ step: "options", options: { ...options, cvLanguage: "es" }, previewId: null, review: null }).ok).toBe(false);
    expect(parseDraftUpdate({ step: "options", options: { ...options, extra: 1 }, previewId: null, review: null }).ok).toBe(false);
    expect(parseDraftUpdate({ step: "options", options, previewId: null, review: null, extra: 1 }).ok).toBe(false);
  });

  it("caps the note and the review's size", () => {
    expect(parseDraftUpdate({ step: "options", options: { ...options, instructions: "x".repeat(1001) }, previewId: null, review: null }).ok).toBe(false);
    const big = { text: "x".repeat(MAX_DRAFT_REVIEW_BYTES) };
    const result = parseDraftUpdate({ step: "review", options, previewId: "pv_1", review: big });
    expect(result).toEqual({ ok: false, error: "This review is too large to keep as a draft." });
  });

  it("drops stored options that no longer validate", () => {
    expect(parseStoredOptions(options)).toEqual(options);
    expect(parseStoredOptions({ ...options, cvLanguage: "xx" })).toBeNull();
    expect(parseStoredOptions(null)).toBeNull();
  });
});
