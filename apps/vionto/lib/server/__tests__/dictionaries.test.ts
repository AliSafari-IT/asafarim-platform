import { describe, expect, it } from "vitest";

import { viontoDictionaries } from "../../i18n-dictionaries";

describe("viontoDictionaries completeness", () => {
  const languages = ["en", "nl", "fr", "de"] as const;
  const baseKeys = Object.keys(viontoDictionaries.en ?? {});

  it("has the same set of keys in every supported language", () => {
    for (const lang of languages) {
      const dict = viontoDictionaries[lang] ?? {};
      const keys = Object.keys(dict);
      expect(keys.sort()).toEqual(baseKeys.sort());
    }
  });

  it("has no empty translations", () => {
    for (const lang of languages) {
      const dict = viontoDictionaries[lang] ?? {};
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim(), `Empty translation for ${key} in ${lang}`).not.toBe("");
      }
    }
  });

  it("contains expected Vionto domain keys", () => {
    const en = viontoDictionaries.en ?? {};
    expect(en["vionto.upload.title"]).toBeTruthy();
    expect(en["vionto.script.title"]).toBeTruthy();
    expect(en["vionto.audio.title"]).toBeTruthy();
    expect(en["vionto.render.title"]).toBeTruthy();
    expect(en["vionto.export.title"]).toBeTruthy();
    expect(en["vionto.mode.cinematic"]).toBeTruthy();
    expect(en["vionto.error.generationFailed"]).toBeTruthy();
  });
});
