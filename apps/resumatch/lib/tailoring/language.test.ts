import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  OUTPUT_LANGUAGES,
  appliedOutputLanguage,
  formatProfileDate,
  formatSpan,
  isOutputLanguage,
  outputLanguageFromLocale,
  templateLabels,
} from "./language";
import { renderTailorPrompt, TAILOR_PROMPT_VERSION } from "./ai/prompts";
import { computeQuality } from "./quality";
import { computeCoverage } from "./coverage";
import { ClassicTemplate } from "../../components/tailoring/templates/Classic";
import type { TailoredResumeContent } from "./ai/schema";

describe("output language basics", () => {
  it("offers exactly the four languages the Belgium language bar offers", () => {
    expect([...OUTPUT_LANGUAGES]).toEqual(["en", "nl", "fr", "de"]);
    expect(isOutputLanguage("nl")).toBe(true);
    expect(isOutputLanguage("lb")).toBe(false);
    expect(isOutputLanguage("Dutch")).toBe(false);
  });

  it("defaults to the page locale's base language, else English", () => {
    expect(outputLanguageFromLocale("nl-BE")).toBe("nl");
    expect(outputLanguageFromLocale("fr-BE")).toBe("fr");
    expect(outputLanguageFromLocale("de-BE")).toBe("de");
    expect(outputLanguageFromLocale("en")).toBe("en");
    expect(outputLanguageFromLocale("lb-LU")).toBe("en");
    expect(outputLanguageFromLocale(null)).toBe("en");
  });

  it("keeps English labels for CVs with no language (older rows)", () => {
    expect(templateLabels(null).experience).toBe("Experience");
    expect(templateLabels("nl").experience).toBe("Werkervaring");
    expect(templateLabels("fr").skillCategories["Databases"]).toBe("Bases de données");
  });
});

describe("profile dates", () => {
  it("leaves dates untouched when no language is set, so older CVs don't change", () => {
    expect(formatProfileDate("2021-03", null)).toBe("2021-03");
  });

  it("localises YYYY-MM per language and leaves other forms alone", () => {
    expect(formatProfileDate("2021-03", "en")).toMatch(/Mar\w* 2021/);
    expect(formatProfileDate("2021-03", "fr")).toMatch(/mars 2021/);
    expect(formatProfileDate("2021-03", "de")).toMatch(/März 2021/);
    expect(formatProfileDate("2021-03", "nl")).toMatch(/mrt\.? 2021/);
    expect(formatProfileDate("2021", "nl")).toBe("2021");
    expect(formatProfileDate("circa 2019", "fr")).toBe("circa 2019");
  });

  it("uses the language's word for a current role", () => {
    expect(formatSpan("2021", null, true, "nl")).toBe("2021 – heden");
    expect(formatSpan("2021", null, true, null)).toBe("2021 – Present");
  });
});

describe("appliedOutputLanguage", () => {
  const prose = { headline: "Ontwikkelaar", summary: null, experienceBullets: [[]] };
  const declinedAll = { headline: null, summary: "  ", experienceBullets: [[], []] };

  it("records the requested language when some AI prose was kept", () => {
    expect(appliedOutputLanguage("nl", false, prose)).toBe("nl");
    expect(appliedOutputLanguage("fr", false, { headline: null, summary: null, experienceBullets: [["Dirigé l’équipe"]] })).toBe("fr");
  });

  it("records nothing for a degraded run", () => {
    expect(appliedOutputLanguage("nl", true, prose)).toBeNull();
  });

  it("records nothing when every suggestion was declined", () => {
    expect(appliedOutputLanguage("nl", false, declinedAll)).toBeNull();
    expect(appliedOutputLanguage("nl", false, null)).toBeNull();
  });

  it("ignores anything that isn't one of the four languages", () => {
    expect(appliedOutputLanguage("klingon", false, prose)).toBeNull();
    expect(appliedOutputLanguage(null, false, prose)).toBeNull();
  });
});

describe("renderTailorPrompt output language", () => {
  it("is tailor_resume@4", () => {
    expect(TAILOR_PROMPT_VERSION).toBe("tailor_resume@4");
  });

  it("adds no language rule when none is requested", () => {
    const prompt = renderTailorPrompt("profile", "job");
    expect(prompt.system).not.toContain("OUTPUT LANGUAGE");
    expect(prompt.outputLanguage).toBeNull();
  });

  it.each([
    ["nl", "Dutch"],
    ["fr", "French"],
    ["de", "German"],
    ["en", "English"],
  ] as const)("asks for %s prose and keeps facts and skills verbatim", (language, name) => {
    const prompt = renderTailorPrompt("profile", "job", null, language);
    expect(prompt.system).toContain(`OUTPUT LANGUAGE — write "headline", "summary", and every string in`);
    expect(prompt.system).toContain(`in ${name}`);
    expect(prompt.system).toContain("keeps its exact value");
    expect(prompt.system).toContain(`"skillsOrder" is NOT translated`);
    expect(prompt.outputLanguage).toBe(language);
  });

  it("gives each language its own cache key", () => {
    const keys = new Set(OUTPUT_LANGUAGES.map((l) => renderTailorPrompt("profile", "job", null, l).cacheKey));
    keys.add(renderTailorPrompt("profile", "job").cacheKey);
    expect(keys.size).toBe(OUTPUT_LANGUAGES.length + 1);
  });
});

describe("ClassicTemplate in another language", () => {
  const content = {
    fullName: "Ada Lovelace",
    headline: "Ontwikkelaar",
    summary: "Korte samenvatting.",
    email: null,
    phone: null,
    skills: ["React", "PostgreSQL", "Docker", "TypeScript"],
    experience: [
      { title: "Software Engineer", employer: "Acme NV", startedOn: "2021-03", endedOn: null, isCurrent: true, bullets: ["Bouwde de API."] },
    ],
    education: [{ qualification: "MSc Informatica", institution: "KU Leuven", completedOn: "2019" }],
    certifications: [],
  } as unknown as TailoredResumeContent;

  it("localises headings, 'Present' and dates, keeps facts verbatim, and marks lang", () => {
    const html = renderToStaticMarkup(createElement(ClassicTemplate, { content, language: "nl" }));
    expect(html).toContain('lang="nl"');
    expect(html).toContain(">Werkervaring<");
    expect(html).toContain(">Opleiding<");
    expect(html).toContain("heden");
    expect(html).toContain("Software Engineer"); // job title verbatim
    expect(html).toContain("Acme NV");
    expect(html).toContain("KU Leuven");
    expect(html).not.toContain(">Experience<");
  });

  it("renders older CVs (no language) exactly as before", () => {
    const html = renderToStaticMarkup(createElement(ClassicTemplate, { content }));
    expect(html).toContain(">Experience<");
    expect(html).toContain("2021-03 – Present");
    expect(html).not.toContain("lang=");
  });
});

describe("language-aware checks", () => {
  const withBullets = (bullets: string[]) =>
    ({
      fullName: null,
      headline: "x",
      summary: "x",
      email: "a@b.c",
      phone: "1",
      skills: [],
      experience: [{ title: "t", employer: null, startedOn: null, endedOn: null, isCurrent: false, bullets }],
      education: [],
      certifications: [],
    }) as unknown as TailoredResumeContent;

  it("flags a weak French opener, accents and all", () => {
    const report = computeQuality(withBullets(["Travaillé sur 3 projets", "Dirigé une équipe de 4"]), "fr");
    expect(report.weakLeadBullets.map((b) => b.text)).toEqual(["Travaillé sur 3 projets"]);
  });

  it("keeps the English check for CVs with no language", () => {
    const report = computeQuality(withBullets(["Responsible for 3 systems", "Built 2 APIs"]));
    expect(report.weakLeadBullets).toHaveLength(1);
  });

  it("drops German stopwords and keeps accented keywords whole", () => {
    const job = "Wir suchen für unser Team Erfahrung mit Datenbanken und Kubernetes. Kubernetes und Développement für die Entwicklung.";
    const report = computeCoverage([], job, "");
    expect(report.missingKeywords).toContain("kubernetes");
    expect(report.missingKeywords).toContain("développement");
    expect(report.missingKeywords).not.toContain("für");
    expect(report.missingKeywords).not.toContain("und");
    expect(report.missingKeywords.some((k) => k === "veloppement" || k === "r")).toBe(false);
  });
});
