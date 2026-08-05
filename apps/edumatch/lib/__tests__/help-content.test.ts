import { describe, expect, it } from "vitest";
import {
  HELP_ARTICLES,
  getArticle,
  getArticlesForAudience,
  getRelatedArticles,
  resolveArticles,
  searchArticles,
} from "../help-content";
import { edumatchDictionaries } from "../i18n-dictionaries";

const BASE_LANGUAGES = ["en", "nl", "fr", "de", "lb"] as const;

/** Collect every translation key the Help content model references. */
function allHelpContentKeys(): string[] {
  const keys: string[] = [];
  for (const a of HELP_ARTICLES) {
    keys.push(a.titleKey, a.summaryKey, a.workflowLabelKey, a.prerequisitesKey, a.expectedResultKey);
    keys.push(...a.keywordKeys, ...a.troubleshootingKeys);
    for (const s of a.steps) keys.push(s.titleKey, s.bodyKey);
  }
  return [...new Set(keys)];
}

const t = (key: string) => key; // identity resolver, used where only structure/coverage matters
/** Real English strings, for tests that need actual searchable content. */
const tEn = (key: string) => edumatchDictionaries.en?.[key] ?? key;

describe("HELP_ARTICLES structure", () => {
  it("every article slug is unique per audience", () => {
    const seen = new Set<string>();
    for (const a of HELP_ARTICLES) {
      const id = `${a.audience}:${a.slug}`;
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });

  it("every article has at least one step and one troubleshooting item", () => {
    for (const a of HELP_ARTICLES) {
      expect(a.steps.length).toBeGreaterThan(0);
      expect(a.troubleshootingKeys.length).toBeGreaterThan(0);
    }
  });

  it("every related slug resolves to a real article in the same audience", () => {
    for (const a of HELP_ARTICLES) {
      const related = getRelatedArticles(a);
      expect(related.length).toBe(a.related.length);
      for (const r of related) expect(r.audience).toBe(a.audience);
    }
  });

  it("workflowRoute is a real in-app path, not a bare /help link", () => {
    for (const a of HELP_ARTICLES) {
      expect(a.workflowRoute.startsWith("/help")).toBe(false);
      expect(a.workflowRoute.startsWith("/")).toBe(true);
    }
  });
});

describe("getArticlesForAudience", () => {
  it("returns only student articles for 'student'", () => {
    const articles = getArticlesForAudience("student");
    expect(articles.length).toBeGreaterThan(0);
    for (const a of articles) expect(a.audience).toBe("student");
  });

  it("returns only tutor articles for 'tutor'", () => {
    const articles = getArticlesForAudience("tutor");
    expect(articles.length).toBeGreaterThan(0);
    for (const a of articles) expect(a.audience).toBe("tutor");
  });
});

describe("getArticle", () => {
  it("finds an article by audience + slug", () => {
    expect(getArticle("student", "ask-a-question")).toBeDefined();
    expect(getArticle("tutor", "ask-a-question")).toBeUndefined();
  });

  it("returns undefined for an unknown slug", () => {
    expect(getArticle("student", "does-not-exist")).toBeUndefined();
  });
});

describe("searchArticles", () => {
  const resolved = resolveArticles(HELP_ARTICLES, tEn);

  it("is case-insensitive", () => {
    const lower = searchArticles(resolved, "stripe", tEn);
    const upper = searchArticles(resolved, "STRIPE", tEn);
    expect(lower.map((a) => a.slug)).toEqual(upper.map((a) => a.slug));
    expect(lower.length).toBeGreaterThan(0);
  });

  it("matches on keyword keys even when the title doesn't contain the term", () => {
    // A keyword like "checkout" should surface the booking article even
    // though its slug/title says "tutor-quotes-and-booking", not "checkout".
    const results = searchArticles(resolved, "checkout", tEn);
    expect(results.some((a) => a.slug === "tutor-quotes-and-booking")).toBe(true);
  });

  it("returns everything unfiltered for an empty query", () => {
    expect(searchArticles(resolved, "", tEn)).toHaveLength(resolved.length);
    expect(searchArticles(resolved, "   ", tEn)).toHaveLength(resolved.length);
  });

  it("returns nothing for a query matching no article", () => {
    expect(searchArticles(resolved, "xyznonexistentquery123", tEn)).toHaveLength(0);
  });
});

describe("Help Center translation coverage", () => {
  const usedKeys = allHelpContentKeys();

  it("references at least one key per article field category", () => {
    // Sanity check the extraction itself isn't accidentally empty.
    expect(usedKeys.length).toBeGreaterThan(50);
  });

  it.each(BASE_LANGUAGES)("every Help content key used by the app has a %s translation", (lang) => {
    const dict = edumatchDictionaries[lang] ?? {};
    const missing = usedKeys.filter((k) => !(k in dict));
    expect(missing).toEqual([]);
  });

  it.each(BASE_LANGUAGES)("no %s Help translation is an empty string", (lang) => {
    const dict = edumatchDictionaries[lang] ?? {};
    const empty = usedKeys.filter((k) => (dict[k] ?? "").trim() === "");
    expect(empty).toEqual([]);
  });

  it.each(BASE_LANGUAGES)("no %s Help translation echoes its own key back (raw key rendered)", (lang) => {
    const dict = edumatchDictionaries[lang] ?? {};
    const echoed = usedKeys.filter((k) => dict[k] === k);
    expect(echoed).toEqual([]);
  });

  it("nav/sidebar Help entries exist in every base language", () => {
    const navKeys = ["edumatch.nav.help", "edumatch.sidebar.help"];
    for (const lang of BASE_LANGUAGES) {
      const dict = edumatchDictionaries[lang] ?? {};
      for (const k of navKeys) {
        expect(dict[k], `${lang}.${k}`).toBeTruthy();
      }
    }
  });
});
