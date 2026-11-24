import { describe, expect, it } from "vitest";
import { EMPTY_WRITING_PREFERENCES, type WritingPreferences } from "./contract";
import { resolveWriting } from "./resolve";

const saved: WritingPreferences = {
  cv: { outputLanguage: "nl", styleNote: "Short sentences." },
  coverLetter: { tone: "warm", length: "short", outputLanguage: "fr", styleNote: "No clichés." },
};

describe("resolveWriting (#931): request, then saved, then default", () => {
  it("uses the application defaults with nothing saved or asked", () => {
    expect(resolveWriting({}, null)).toEqual({
      cvLanguage: { value: null, source: "default" },
      letterTone: { value: "formal", source: "default" },
      letterLength: { value: "standard", source: "default" },
      letterLanguage: { value: null, source: "default" },
      cvStyleNote: null,
      letterStyleNote: null,
      styleNotes: "none",
    });
    expect(resolveWriting({}, EMPTY_WRITING_PREFERENCES).letterTone).toEqual({ value: "formal", source: "default" });
  });

  it("uses saved values when the request leaves them out", () => {
    const r = resolveWriting({}, saved);
    expect(r.cvLanguage).toEqual({ value: "nl", source: "saved" });
    expect(r.letterTone).toEqual({ value: "warm", source: "saved" });
    expect(r.letterLength).toEqual({ value: "short", source: "saved" });
    expect(r.letterLanguage).toEqual({ value: "fr", source: "saved" });
    expect([r.cvStyleNote, r.letterStyleNote, r.styleNotes]).toEqual(["Short sentences.", "No clichés.", "saved"]);
  });

  it("lets this request override each saved value, and counts an equal value as saved", () => {
    const r = resolveWriting({ cvLanguage: "en", letterTone: "warm", letterLength: "detailed", letterLanguage: null }, saved);
    expect(r.cvLanguage).toEqual({ value: "en", source: "request" });
    expect(r.letterTone).toEqual({ value: "warm", source: "saved" });
    expect(r.letterLength).toEqual({ value: "detailed", source: "request" });
    // An explicit "same as the CV" beats a saved letter language.
    expect(r.letterLanguage).toEqual({ value: null, source: "request" });
  });

  it("an explicit 'same as the CV' with nothing saved is the default", () => {
    expect(resolveWriting({ letterLanguage: null }, null).letterLanguage).toEqual({ value: null, source: "default" });
  });

  it("leaves the saved style notes out of one run without touching the values", () => {
    const r = resolveWriting({ useSavedStyle: false }, saved);
    expect([r.cvStyleNote, r.letterStyleNote, r.styleNotes]).toEqual([null, null, "off"]);
    expect(r.letterTone.source).toBe("saved");
  });

  it("is deterministic", () => {
    const request = { cvLanguage: "de" as const, letterTone: "confident" as const };
    expect(resolveWriting(request, saved)).toEqual(resolveWriting(request, saved));
  });
});
