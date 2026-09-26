import { describe, expect, it } from "vitest";
import resumatchDictionaries, { resumatchDictionaryAreas as areas } from "./i18n-dictionaries";
const LANGS = ["nl", "fr", "de"] as const;

describe("ResuMatch i18n dictionaries", () => {
  // A key missing in one language silently falls back to English, so the
  // gap would only show up as one English phrase in a translated page.
  it.each(Object.entries(areas))("%s: every language has exactly the English keys", (_name, area) => {
    const english = Object.keys(area.en ?? {}).sort();
    expect(english.length).toBeGreaterThan(0);
    for (const lang of LANGS) {
      expect(Object.keys(area[lang] ?? {}).sort(), lang).toEqual(english);
    }
  });

  it("keeps the same {placeholders} in every translation", () => {
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    const en = resumatchDictionaries.en ?? {};
    for (const lang of LANGS) {
      for (const [key, value] of Object.entries(resumatchDictionaries[lang] ?? {})) {
        expect(placeholders(value), `${lang} ${key}`).toEqual(placeholders(en[key] ?? ""));
      }
    }
  });

  it("merges every area without one area's key shadowing another's", () => {
    const total = Object.values(areas).reduce((n, area) => n + Object.keys(area.en ?? {}).length, 0);
    expect(Object.keys(resumatchDictionaries.en ?? {})).toHaveLength(total);
  });
});
