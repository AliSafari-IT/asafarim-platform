import {
  type CandidateProfileContent,
  type ProfileConfidence,
  emptyProfile,
  parseProfileContent,
} from "../profile/contract";

/**
 * Turning CV text into a draft profile (JM-020).
 *
 * This is a deterministic, rule-based extractor, and that is a deliberate
 * choice for M2 rather than a placeholder for a model:
 *
 * - It runs locally, so CV text does not leave the platform. Sending every
 *   candidate's CV to a model provider is a disclosure decision that JM-005
 *   has not been answered for yet.
 * - It is reproducible. A profile version records the extractor name and
 *   version, and re-running this code on the same bytes gives the same
 *   result — which is what makes a past match explainable.
 * - It is honest about confidence. Every field it emits carries a score,
 *   and the review UI marks the low ones. A model would produce more fields
 *   with less basis for trusting any of them.
 *
 * The model-backed extractor arrives with M5 alongside its evaluation set
 * (JM-045) and its cost controls (JM-047). Until then, the correction UI is
 * what makes this useful: the extractor's job is to save typing, not to be
 * right, and the candidate confirms everything before matching runs.
 *
 * Nothing here infers a protected attribute. Age, nationality, gender, and
 * marital status are all readable from a typical CV and are all skipped;
 * `parseProfileContent` rejects them structurally if a future change tries.
 */

export const PROFILE_EXTRACTOR_NAME = "jobmatch-rules";
export const PROFILE_EXTRACTOR_VERSION = "1.0.0";

export interface ExtractedProfile {
  content: CandidateProfileContent;
  confidence: ProfileConfidence;
}

/** Email is the one field a regex gets right essentially always. */
const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}\b/;

/**
 * International and Belgian phone shapes. Kept conservative: a false
 * positive here puts a wrong number in front of the candidate, which is
 * noise, while a miss just means they type it.
 */
const PHONE = /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,4}\d{2,4}/;

/**
 * Section headings in the three languages JobMatch launches with. Matching
 * headings rather than free text is what keeps this from inventing
 * structure that is not there.
 */
const SECTION_HEADINGS: Record<string, RegExp> = {
  skills: /^(skills?|competenties|vaardigheden|comp[ée]tences|technical skills|technologies)\s*:?\s*$/i,
  experience:
    /^(experience|work experience|professional experience|werkervaring|ervaring|exp[ée]rience|exp[ée]rience professionnelle)\s*:?\s*$/i,
  education: /^(education|opleiding|opleidingen|studies|formation|dipl[oô]mes?)\s*:?\s*$/i,
  languages: /^(languages?|talen|talenkennis|langues)\s*:?\s*$/i,
  certifications: /^(certifications?|certificaten|certificats|licenses?)\s*:?\s*$/i,
};

/**
 * Language names in the languages JobMatch supports, mapped to ISO 639-1.
 * Written both ways round — an English CV says "Dutch", a Dutch one says
 * "Nederlands", and both should resolve to `nl`.
 */
const LANGUAGE_NAMES: Record<string, { code: string; label: string }> = {
  english: { code: "en", label: "English" },
  engels: { code: "en", label: "Engels" },
  anglais: { code: "en", label: "Anglais" },
  dutch: { code: "nl", label: "Dutch" },
  nederlands: { code: "nl", label: "Nederlands" },
  neerlandais: { code: "nl", label: "N\u00e9erlandais" },
  french: { code: "fr", label: "French" },
  frans: { code: "fr", label: "Frans" },
  francais: { code: "fr", label: "Fran\u00e7ais" },
  german: { code: "de", label: "German" },
  duits: { code: "de", label: "Duits" },
  allemand: { code: "de", label: "Allemand" },
};

const PROFICIENCY_HINTS: { pattern: RegExp; value: "basic" | "conversational" | "professional" | "native" }[] = [
  { pattern: /\b(native|moedertaal|maternelle|c2)\b/i, value: "native" },
  { pattern: /\b(fluent|professional|vloeiend|courant|c1|b2)\b/i, value: "professional" },
  { pattern: /\b(conversational|goed|bien|b1)\b/i, value: "conversational" },
  { pattern: /\b(basic|basis|notions|a1|a2)\b/i, value: "basic" },
];

/** Lowercase and strip diacritics, so accented and unaccented spellings of
 *  the same word compare equal. */
function foldAccents(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Splits a line into list items on the separators CVs actually use. */
function splitList(line: string): string[] {
  return line
    .split(/[,;|/]|\s{2,}|•|·|\s-\s/)
    .map((part) => part.trim().replace(/^[-*•·]\s*/, "").trim())
    .filter((part) => part.length > 1 && part.length <= 80);
}

function sectionsOf(text: string): Record<string, string[]> {
  const lines = text.split("\n").map((line) => line.trim());
  const sections: Record<string, string[]> = {};
  let current: string | null = null;

  for (const line of lines) {
    const heading = Object.entries(SECTION_HEADINGS).find(([, pattern]) => pattern.test(line));
    if (heading) {
      current = heading[0];
      sections[current] ??= [];
      continue;
    }
    if (current && line.length > 0) sections[current].push(line);
  }
  return sections;
}

/**
 * The candidate's name. The heuristic — the first short line before any
 * contact detail — is weak, which is exactly why it is emitted with low
 * confidence and flagged for review rather than quietly trusted.
 */
function guessName(text: string): string | null {
  for (const line of text.split("\n").slice(0, 6)) {
    const candidate = line.trim();
    if (candidate.length < 3 || candidate.length > 60) continue;
    if (EMAIL.test(candidate) || /\d/.test(candidate)) continue;
    if (/^(curriculum|cv|resume|r[ée]sum[ée])\b/i.test(candidate)) continue;
    const words = candidate.split(/\s+/);
    if (words.length >= 2 && words.length <= 5) return candidate;
  }
  return null;
}

function extractLanguages(sections: Record<string, string[]>): CandidateProfileContent["languages"] {
  const lines = sections.languages ?? [];
  const found = new Map<string, CandidateProfileContent["languages"][number]>();

  for (const line of lines) {
    // Accent-folded before matching: a CV written on one keyboard says
    // "Français" and on another "Francais", and a PDF extractor can flatten
    // either. Matching the folded form catches all three, and the label we
    // store is still the properly-accented one from the table.
    const lower = foldAccents(line);
    for (const [name, { code, label }] of Object.entries(LANGUAGE_NAMES)) {
      if (!lower.includes(name)) continue;
      const proficiency = PROFICIENCY_HINTS.find((hint) => hint.pattern.test(line))?.value ?? null;
      // A later mention with a proficiency beats an earlier bare one.
      const existing = found.get(code);
      if (!existing || (existing.proficiency === null && proficiency !== null)) {
        found.set(code, { code, label, proficiency });
      }
    }
  }
  return [...found.values()].slice(0, 20);
}

function extractSkills(sections: Record<string, string[]>): CandidateProfileContent["skills"] {
  const seen = new Set<string>();
  const skills: CandidateProfileContent["skills"] = [];

  for (const line of sections.skills ?? []) {
    for (const item of splitList(line)) {
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      // rawLabel preserves what the CV actually said; normalisation to a
      // controlled vocabulary is M4's job and must not erase the original.
      skills.push({ name: item, rawLabel: item, yearsExperience: null });
      if (skills.length >= 200) return skills;
    }
  }
  return skills;
}

/** `2021 - 2024`, `03/2021 – present`, `2021-03 tot heden`. */
const DATE_RANGE =
  /(\d{1,2}[./-])?(\d{4})\s*(?:[-–—]|to|tot|until|jusqu'?[aà]|→)\s*((\d{1,2}[./-])?(\d{4})|present|current|heden|nu|aujourd'?hui|actuel)/i;

function toIsoMonth(month: string | undefined, year: string): string {
  if (!month) return year;
  const numeric = month.replace(/[./-]/g, "").padStart(2, "0");
  return `${year}-${numeric}`;
}

function extractExperience(sections: Record<string, string[]>): CandidateProfileContent["experience"] {
  const entries: CandidateProfileContent["experience"] = [];

  for (const line of sections.experience ?? []) {
    const match = DATE_RANGE.exec(line);
    if (!match) continue;

    const [, startMonth, startYear, endRaw, endMonth, endYear] = match;
    const isCurrent = /present|current|heden|nu|aujourd|actuel/i.test(endRaw);

    // Whatever is left after removing the dates is the role description.
    const title = line
      .replace(DATE_RANGE, "")
      .replace(/^[\s,;:|–—-]+|[\s,;:|–—-]+$/g, "")
      .trim();
    if (title.length < 2) continue;

    // "Engineer at Probex" / "Engineer, Probex" — the employer, if present,
    // follows the separator.
    const split = /^(.*?)\s*(?:\bat\b|\bbij\b|\bchez\b|,|–|—|\|)\s*(.+)$/i.exec(title);

    entries.push({
      title: (split ? split[1] : title).slice(0, 120).trim(),
      employer: split ? split[2].slice(0, 120).trim() : null,
      startedOn: toIsoMonth(startMonth, startYear),
      endedOn: isCurrent ? null : endYear ? toIsoMonth(endMonth, endYear) : null,
      isCurrent,
      summary: null,
    });
    if (entries.length >= 60) break;
  }
  return entries;
}

function extractEducation(sections: Record<string, string[]>): CandidateProfileContent["education"] {
  const entries: CandidateProfileContent["education"] = [];
  for (const line of sections.education ?? []) {
    const year = /\b(19|20)\d{2}\b/.exec(line);
    const qualification = line.replace(/\b(19|20)\d{2}\b/g, "").replace(/[\s,;:|-]+$/g, "").trim();
    if (qualification.length < 3) continue;
    entries.push({
      qualification: qualification.slice(0, 160),
      institution: null,
      completedOn: year ? year[0] : null,
    });
    if (entries.length >= 30) break;
  }
  return entries;
}

function extractCertifications(
  sections: Record<string, string[]>,
): CandidateProfileContent["certifications"] {
  const entries: CandidateProfileContent["certifications"] = [];
  for (const line of sections.certifications ?? []) {
    const name = line.replace(/^[-*•·]\s*/, "").replace(/\b(19|20)\d{2}\b/g, "").trim();
    if (name.length < 2) continue;
    const year = /\b(19|20)\d{2}\b/.exec(line);
    entries.push({
      name: name.slice(0, 160),
      issuer: null,
      issuedOn: year ? year[0] : null,
      // Never guessed. An expired certification is a hard exclusion in M4,
      // and inferring an expiry the CV did not state would exclude someone
      // on invented evidence.
      expiresOn: null,
    });
    if (entries.length >= 40) break;
  }
  return entries;
}

/**
 * Confidence, stated honestly.
 *
 * These are not calibrated probabilities and are not presented as such —
 * they are a three-tier ranking of how much structure the extractor had to
 * go on, so the review UI can put the candidate's attention where the
 * guessing was worst. An email matched by regex is near-certain; a name
 * guessed from line position is not, and is scored below the review
 * threshold so it is always flagged.
 */
const CONFIDENCE = {
  /** Unambiguous pattern match. */
  high: 0.95,
  /** Found under an explicit section heading. */
  section: 0.8,
  /** Positional or shape-based guess — always flagged for review. */
  guess: 0.45,
} as const;

export function extractProfileFromText(text: string): ExtractedProfile {
  const sections = sectionsOf(text);
  const draft = emptyProfile();
  const confidence: ProfileConfidence = {};

  const email = EMAIL.exec(text)?.[0] ?? null;
  if (email) {
    draft.email = email;
    confidence.email = CONFIDENCE.high;
  }

  // Search only the head of the document: a phone number in the body is
  // more likely a former employer's than the candidate's.
  const phone = PHONE.exec(text.split("\n").slice(0, 12).join("\n"))?.[0]?.trim() ?? null;
  if (phone && phone.replace(/\D/g, "").length >= 8) {
    draft.phone = phone;
    confidence.phone = CONFIDENCE.guess;
  }

  const name = guessName(text);
  if (name) {
    draft.fullName = name;
    confidence.fullName = CONFIDENCE.guess;
  }

  draft.languages = extractLanguages(sections);
  if (draft.languages.length > 0) confidence.languages = CONFIDENCE.section;

  draft.skills = extractSkills(sections);
  if (draft.skills.length > 0) confidence.skills = CONFIDENCE.section;

  draft.experience = extractExperience(sections);
  if (draft.experience.length > 0) confidence.experience = CONFIDENCE.guess;

  draft.education = extractEducation(sections);
  if (draft.education.length > 0) confidence.education = CONFIDENCE.guess;

  draft.certifications = extractCertifications(sections);
  if (draft.certifications.length > 0) confidence.certifications = CONFIDENCE.guess;

  // Re-parsed rather than returned directly: the contract is the authority,
  // and an extractor bug should surface here rather than in the database.
  return { content: parseProfileContent(draft), confidence };
}
