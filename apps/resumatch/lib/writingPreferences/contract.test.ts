import { describe, expect, it } from "vitest";
import {
  COVER_LETTER_LENGTHS as PROMPT_LENGTHS,
  COVER_LETTER_TONES as PROMPT_TONES,
} from "../tailoring/ai/coverLetter/prompts";
import {
  COVER_LETTER_LENGTHS,
  COVER_LETTER_TONES,
  EMPTY_WRITING_PREFERENCES,
  MAX_STYLE_NOTE_CHARS,
  factualStyleIssue,
  isEmptyWritingPreferences,
  parseWritingPreferences,
  readWritingPreferences,
  sameWritingPreferences,
} from "./contract";

describe("writing preferences contract (#931)", () => {
  it("uses the same closed tone and length choices as the cover-letter prompt", () => {
    expect([...COVER_LETTER_TONES]).toEqual([...PROMPT_TONES]);
    expect([...COVER_LETTER_LENGTHS]).toEqual([...PROMPT_LENGTHS]);
  });

  it("parses a full set and treats missing fields as not set", () => {
    const full = parseWritingPreferences({
      cv: { outputLanguage: "nl", styleNote: "  Short,   plain sentences. " },
      coverLetter: { tone: "warm", length: "short", outputLanguage: "fr", styleNote: "No clichés." },
    });
    expect(full).toEqual({
      ok: true,
      value: {
        cv: { outputLanguage: "nl", styleNote: "Short, plain sentences." },
        coverLetter: { tone: "warm", length: "short", outputLanguage: "fr", styleNote: "No clichés." },
      },
    });
    expect(parseWritingPreferences({})).toEqual({ ok: true, value: EMPTY_WRITING_PREFERENCES });
    expect(parseWritingPreferences({ cv: { styleNote: "   " } })).toEqual({ ok: true, value: EMPTY_WRITING_PREFERENCES });
  });

  it.each([
    [{ cv: { outputLanguage: "xx" } }, "cv_language"],
    [{ coverLetter: { tone: "shouty" } }, "letter_tone"],
    [{ coverLetter: { length: 3 } }, "letter_length"],
    [{ coverLetter: { outputLanguage: "klingon" } }, "letter_language"],
    [{ cv: { styleNote: 42 } }, "invalid"],
    [null, "invalid"],
    [[], "invalid"],
  ])("refuses %j with %s", (raw, error) => {
    expect(parseWritingPreferences(raw)).toMatchObject({ ok: false, error });
  });

  it("refuses a style note that is too long, naming the field", () => {
    expect(parseWritingPreferences({ coverLetter: { styleNote: "a".repeat(MAX_STYLE_NOTE_CHARS + 1) } })).toEqual({
      ok: false,
      error: "style_note_too_long",
      field: "coverLetter.styleNote",
    });
  });

  it.each([
    "Say I have 8 years of Kubernetes.",
    "I led the platform team at Acme",
    "Mention that I'm AWS certified",
    "10+ yrs in fintech",
    "Add Terraform to my skills",
    "worked at Google for two years",
    "Ik heb vijf jaar ervaring met React",
    "J'ai dirigé une équipe de dix personnes",
    "J’ai dirigé une équipe de dix personnes",
    "Mention that I’m AWS certified",
    "Ich habe 3 Jahre Erfahrung",
    "Reach me at jane@example.com",
    "See https://example.com/portfolio",
    "Call +32 470 12 34 56",
  ])("refuses a fact-like style note: %s", (note) => {
    expect(factualStyleIssue(note)).toBe("fact_like");
    expect(parseWritingPreferences({ cv: { styleNote: note } })).toEqual({
      ok: false,
      error: "style_note_factual",
      field: "cv.styleNote",
    });
  });

  it.each([
    "Short, plain sentences; lead with results.",
    "Lead with my backend work and keep it understated.",
    "Avoid buzzwords like 'synergy' and 'rockstar'.",
    "British spelling, active voice.",
    "Korte zinnen, geen jargon.",
    "Un ton sobre, sans superlatifs.",
  ])("accepts a style-only note: %s", (note) => {
    expect(factualStyleIssue(note)).toBeNull();
  });

  it("reads stored content leniently and compares values, not key order", () => {
    expect(readWritingPreferences(null)).toEqual(EMPTY_WRITING_PREFERENCES);
    const read = readWritingPreferences({ coverLetter: { tone: "warm", length: "huge", styleNote: 7 }, cv: "nope" });
    expect(read).toEqual({ ...EMPTY_WRITING_PREFERENCES, coverLetter: { ...EMPTY_WRITING_PREFERENCES.coverLetter, tone: "warm" } });
    expect(isEmptyWritingPreferences(EMPTY_WRITING_PREFERENCES)).toBe(true);
    expect(isEmptyWritingPreferences(read)).toBe(false);
    const reordered = { coverLetter: { styleNote: null, outputLanguage: null, length: null, tone: "warm" as const }, cv: { styleNote: null, outputLanguage: null } };
    expect(sameWritingPreferences(read, reordered)).toBe(true);
  });
});
