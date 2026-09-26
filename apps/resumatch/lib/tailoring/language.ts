import type { SkillCategory } from "../profile/skillCategories";

/**
 * Output language for tailored documents (#641, and #642 for cover
 * letters). A closed choice — the four languages the Belgium-locked
 * language bar offers (#640) — never free text, so it adds no prompt-
 * injection surface (the same pattern as cover-letter tone/length, #455).
 *
 * Only generated prose (headline, summary, experience bullets) is written
 * in the chosen language. Facts copied from the profile in code — employer,
 * job title, dates, education, certifications — and skill names stay
 * verbatim; section headings and other fixed labels are localised by the
 * templates below, not by the model.
 */
export const OUTPUT_LANGUAGES = ["en", "nl", "fr", "de"] as const;
export type OutputLanguage = (typeof OUTPUT_LANGUAGES)[number];

export function isOutputLanguage(value: unknown): value is OutputLanguage {
  return typeof value === "string" && (OUTPUT_LANGUAGES as readonly string[]).includes(value);
}

/** The page locale's base language if it's one we write in, else English
 *  (`nl-BE` → `nl`, `lb-LU` → `en`). */
export function outputLanguageFromLocale(locale: string | null | undefined): OutputLanguage {
  const base = (locale ?? "").toLowerCase().split("-")[0];
  return isOutputLanguage(base) ? base : "en";
}

/** English names used inside the (English-language) system prompt. */
export const PROMPT_LANGUAGE_NAMES: Record<OutputLanguage, string> = {
  en: "English",
  nl: "Dutch",
  fr: "French",
  de: "German",
};

/** Names shown to the candidate, in their own language. */
export const LANGUAGE_LABELS: Record<OutputLanguage, string> = {
  en: "English",
  nl: "Nederlands",
  fr: "Français",
  de: "Deutsch",
};

export interface TemplateLabels {
  summary: string;
  skills: string;
  experience: string;
  education: string;
  certifications: string;
  present: string;
  skillCategories: Record<SkillCategory, string>;
}

const LABELS: Record<OutputLanguage, TemplateLabels> = {
  en: {
    summary: "Summary",
    skills: "Skills",
    experience: "Experience",
    education: "Education",
    certifications: "Certifications",
    present: "Present",
    skillCategories: {
      "Languages & Frameworks": "Languages & Frameworks",
      "Frontend Development": "Frontend Development",
      "Backend & APIs": "Backend & APIs",
      Databases: "Databases",
      "Cloud & DevOps": "Cloud & DevOps",
      "Version Control": "Version Control",
      "Testing & QA": "Testing & QA",
      "Tools & IDEs": "Tools & IDEs",
      "Data & Analytics": "Data & Analytics",
      "Project & Process": "Project & Process",
      Other: "Other",
    },
  },
  nl: {
    summary: "Profiel",
    skills: "Vaardigheden",
    experience: "Werkervaring",
    education: "Opleiding",
    certifications: "Certificaten",
    present: "heden",
    skillCategories: {
      "Languages & Frameworks": "Talen & frameworks",
      "Frontend Development": "Frontendontwikkeling",
      "Backend & APIs": "Backend & API's",
      Databases: "Databases",
      "Cloud & DevOps": "Cloud & DevOps",
      "Version Control": "Versiebeheer",
      "Testing & QA": "Testen & QA",
      "Tools & IDEs": "Tools & IDE's",
      "Data & Analytics": "Data & analyse",
      "Project & Process": "Project & proces",
      Other: "Overige",
    },
  },
  fr: {
    summary: "Profil",
    skills: "Compétences",
    experience: "Expérience professionnelle",
    education: "Formation",
    certifications: "Certifications",
    present: "aujourd’hui",
    skillCategories: {
      "Languages & Frameworks": "Langages & frameworks",
      "Frontend Development": "Développement frontend",
      "Backend & APIs": "Backend & API",
      Databases: "Bases de données",
      "Cloud & DevOps": "Cloud & DevOps",
      "Version Control": "Gestion de versions",
      "Testing & QA": "Tests & QA",
      "Tools & IDEs": "Outils & IDE",
      "Data & Analytics": "Données & analyse",
      "Project & Process": "Projet & méthodes",
      Other: "Autres",
    },
  },
  de: {
    summary: "Profil",
    skills: "Kenntnisse",
    experience: "Berufserfahrung",
    education: "Ausbildung",
    certifications: "Zertifikate",
    present: "heute",
    skillCategories: {
      "Languages & Frameworks": "Sprachen & Frameworks",
      "Frontend Development": "Frontend-Entwicklung",
      "Backend & APIs": "Backend & APIs",
      Databases: "Datenbanken",
      "Cloud & DevOps": "Cloud & DevOps",
      "Version Control": "Versionsverwaltung",
      "Testing & QA": "Testing & QS",
      "Tools & IDEs": "Tools & IDEs",
      "Data & Analytics": "Daten & Analyse",
      "Project & Process": "Projekt & Prozess",
      Other: "Sonstiges",
    },
  },
};

/** Template labels for a stored `outputLanguage`. Null — a CV made before
 *  this existed, or one where no language was applied — keeps English,
 *  exactly as those CVs have always rendered. */
export function templateLabels(language: string | null | undefined): TemplateLabels {
  return LABELS[isOutputLanguage(language) ? language : "en"];
}

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * A profile date for display. `YYYY-MM` becomes a localised short month
 * ("Mar 2021", "mrt. 2021", "mars 2021", "März 2021") when a language is
 * set; with no language (older CVs) it's returned exactly as stored, so
 * those don't change. Anything else — "2021", free text — is untouched.
 * UTC-pinned so server and client always agree.
 */
export function formatProfileDate(value: string | null, language: string | null | undefined): string | null {
  if (!value || !isOutputLanguage(language)) return value;
  const match = MONTH_PATTERN.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  const locale = { en: "en-GB", nl: "nl-BE", fr: "fr-BE", de: "de-BE" }[language];
  return new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

/** "start – end" for an experience entry, localised. */
export function formatSpan(
  startedOn: string | null,
  endedOn: string | null,
  isCurrent: boolean,
  language: string | null | undefined,
): string | null {
  const start = formatProfileDate(startedOn, language);
  const end = isCurrent ? templateLabels(language).present : formatProfileDate(endedOn, language);
  if (!start && !end) return null;
  return [start, end].filter(Boolean).join(" – ");
}

/**
 * The language to record on a saved CV (#641). The requested language only
 * counts when some AI-written prose actually made it in: a degraded run, or
 * a review where the headline, summary and every bullet were declined,
 * leaves the profile's own wording — so nothing was written in the chosen
 * language and the honest answer is null.
 */
export function appliedOutputLanguage(
  requested: string | null | undefined,
  degraded: boolean,
  approved: { headline: string | null; summary: string | null; experienceBullets: string[][] } | null,
): OutputLanguage | null {
  if (degraded || !approved || !isOutputLanguage(requested)) return null;
  const anyProse =
    Boolean(approved.headline?.trim()) ||
    Boolean(approved.summary?.trim()) ||
    approved.experienceBullets.some((bullets) => bullets.some((b) => b.trim()));
  return anyProse ? requested : null;
}
