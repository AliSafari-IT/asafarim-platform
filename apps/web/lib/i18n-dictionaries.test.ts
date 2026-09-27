import { describe, expect, it } from "vitest";
import webDictionaries from "./i18n-dictionaries";

const LOCALES = ["en", "nl", "fr", "de", "lb"] as const;

const en = webDictionaries.en ?? {};

describe("AI Workbench dictionary keys", () => {
  const english = Object.keys(en).filter(
    (k) => k.startsWith("web.tools.") || k === "web.nav.tools" || k.startsWith("web.home.workCard.ai.tools")
  );

  it("exist", () => {
    expect(english.length).toBeGreaterThan(30);
  });

  it.each(LOCALES)("are all translated in %s, keeping {placeholders}", (locale) => {
    const dict = webDictionaries[locale] ?? {};
    for (const key of english) {
      expect(dict[key], `${locale}: ${key}`).toBeTruthy();
      const placeholders = (en[key].match(/\{\w+\}/g) ?? []).sort();
      expect((dict[key].match(/\{\w+\}/g) ?? []).sort(), `${locale}: ${key}`).toEqual(placeholders);
    }
  });
});
