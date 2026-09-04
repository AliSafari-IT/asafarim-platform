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
  /**
   * False when the document's text did not come out in reading order, which
   * makes every section-derived field untrustworthy. The caller records it so
   * the candidate is told the layout could not be read, rather than being
   * shown a form full of plausible-looking nonsense.
   */
  layoutReliable: boolean;
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
 * The same headings, anchored only at the start of a line so a heading glued
 * to another column's text is still recognised.
 *
 * Designed CVs are laid out in columns, and PDF extraction walks the page in
 * draw order rather than reading order. The result is lines like
 * `E X P E R I E N C EBE-3510 KERMT, Hasselt` — a heading and an unrelated
 * column's first line concatenated with no separator. Whole-line matching
 * misses every one of those.
 */
const SECTION_HEADING_PREFIXES: Record<string, RegExp> = {
  skills: /^(technical skills|competenties|vaardigheden|comp[ée]tences|technologies|skills?)\s*:?/i,
  experience:
    /^(professional experience|work experience|exp[ée]rience professionnelle|werkervaring|experience|exp[ée]rience|ervaring)\s*:?/i,
  education: /^(education|opleidingen|opleiding|studies|formation|dipl[oô]mes?)\s*:?/i,
  languages: /^(languages?|talenkennis|talen|langues)\s*:?/i,
  certifications: /^(certifications?|certificaten|certificats|licenses?)\s*:?/i,
  // Not a section anything is extracted from, but recognising it stops the
  // lines after it being attributed to whatever section came before. A
  // references block carries other people's names and email addresses.
  references: /^(references?|referenties|r[ée]f[ée]rences?)\s*:?/i,
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
  // Belgium's labour market is not three-language. Leaving these out meant
  // silently dropping a candidate's native language, which is both a worse
  // profile and a worse signal about who the product is built for.
  spanish: { code: "es", label: "Spanish" },
  spaans: { code: "es", label: "Spaans" },
  espagnol: { code: "es", label: "Espagnol" },
  italian: { code: "it", label: "Italian" },
  italiaans: { code: "it", label: "Italiaans" },
  italien: { code: "it", label: "Italien" },
  portuguese: { code: "pt", label: "Portuguese" },
  portugees: { code: "pt", label: "Portugees" },
  polish: { code: "pl", label: "Polish" },
  pools: { code: "pl", label: "Pools" },
  polonais: { code: "pl", label: "Polonais" },
  romanian: { code: "ro", label: "Romanian" },
  roemeens: { code: "ro", label: "Roemeens" },
  turkish: { code: "tr", label: "Turkish" },
  turks: { code: "tr", label: "Turks" },
  arabic: { code: "ar", label: "Arabic" },
  arabisch: { code: "ar", label: "Arabisch" },
  arabe: { code: "ar", label: "Arabe" },
  persian: { code: "fa", label: "Persian" },
  farsi: { code: "fa", label: "Farsi" },
  perzisch: { code: "fa", label: "Perzisch" },
  russian: { code: "ru", label: "Russian" },
  russisch: { code: "ru", label: "Russisch" },
  ukrainian: { code: "uk", label: "Ukrainian" },
  oekraiens: { code: "uk", label: "Oekraïens" },
};

/**
 * Order matters: the first match wins, so the strongest claim is listed
 * first. "Native speaker" must not be read as "speaker of some kind".
 */
const PROFICIENCY_HINTS: { pattern: RegExp; value: "basic" | "conversational" | "professional" | "native" }[] = [
  { pattern: /\b(native|mother\s*tongue|moedertaal|maternelle|c2)\b/i, value: "native" },
  {
    pattern: /\b(fluent|fluency|proficient|proficiency|professional|advanced|vloeiend|uitstekend|courant|c1|b2)\b/i,
    value: "professional",
  },
  { pattern: /\b(conversational|intermediate|good|goed|bien|b1)\b/i, value: "conversational" },
  { pattern: /\b(basic|beginner|elementary|basis|notions|a1|a2)\b/i, value: "basic" },
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

/**
 * Whether a fragment is plausibly the name of a skill.
 *
 * Without this, a prose bullet like "Database Management: Used MongoDB and
 * SQL Server to design, query, and manage databases effectively" is split on
 * its commas and stored as three "skills". A skill is a short noun phrase; a
 * sentence, a URL, an email, or a date is not, whatever section it sat under.
 */
export function looksLikeSkill(candidate: string): boolean {
  const value = candidate.trim();
  if (value.length < 2 || value.length > 50) return false;
  // Ends like a sentence.
  if (/[.:;!?]$/.test(value)) return false;
  if (value.split(/\s+/).length > 5) return false;
  // Contact details and links appear in every CV and are not skills.
  if (/@|https?:|www\./i.test(value)) return false;
  if (/\b(19|20)\d{2}\b/.test(value)) return false;
  // Connectives mark prose. Short fragments are spared so "Ruby on Rails"
  // and "Test of Record" survive.
  if (
    value.split(/\s+/).length > 3 &&
    /\b(and|with|the|for|to|of|in|using|used|van|voor|met|et|des|pour)\b/i.test(value)
  ) {
    return false;
  }
  return /[a-z]/i.test(value);
}

/**
 * Collapse the letter-spacing that designed CVs use for headings.
 *
 * `E D U C A T I O N` is one word set with tracking; extraction preserves it
 * as nine single-character tokens. Joining runs of single characters recovers
 * `EDUCATION`, which is the difference between finding a document's sections
 * and finding none of them. Runs shorter than four characters are left alone
 * so ordinary prose containing "a" or "I" is untouched.
 */
export function collapseLetterSpacing(line: string): string {
  return line.replace(/(?:(?:^|\s)[A-Za-z](?=\s|$)){4,}/g, (run) => {
    const collapsed = run.replace(/\s+/g, "");
    return run.startsWith(" ") ? ` ${collapsed}` : collapsed;
  });
}

/** The section a line opens, plus any content glued to the heading. */
function headingAt(line: string): { section: string; rest: string } | null {
  const collapsed = collapseLetterSpacing(line).trim();

  // A whole-line heading is unambiguous, so it is tried first.
  for (const [section, pattern] of Object.entries(SECTION_HEADINGS)) {
    if (pattern.test(collapsed)) return { section, rest: "" };
  }

  // Otherwise a heading may open the line with content glued behind it.
  // Longest match wins, so "work experience" is not read as "experience".
  let best: { section: string; rest: string; length: number } | null = null;
  for (const [section, pattern] of Object.entries(SECTION_HEADING_PREFIXES)) {
    const match = pattern.exec(collapsed);
    if (!match) continue;
    const rest = collapsed.slice(match[0].length);
    // What follows must start a new word, or "Skillset" and "Educational"
    // would register as headings.
    if (rest.length > 0 && /^[a-z]/.test(rest)) continue;
    if (!best || match[0].length > best.length) {
      best = { section, rest: rest.trim(), length: match[0].length };
    }
  }
  return best ? { section: best.section, rest: best.rest } : null;
}

function sectionsOf(text: string): Record<string, string[]> {
  const lines = text.split("\n").map((line) => line.trim());
  const sections: Record<string, string[]> = {};
  let current: string | null = null;

  for (const line of lines) {
    const heading = headingAt(line);
    if (heading) {
      current = heading.section;
      sections[current] ??= [];
      if (heading.rest.length > 0) sections[current].push(heading.rest);
      continue;
    }
    if (current && line.length > 0) sections[current].push(line);
  }
  return sections;
}

/**
 * Whether the document's text came out in reading order at all.
 *
 * The section parser assumes the text stream follows the page's reading
 * order. Single-column CVs satisfy that; multi-column designed ones do not —
 * extraction walks the page in draw order, so a heading can appear *after*
 * the content it labels, and one section then swallows the whole document.
 *
 * That failure is silent and ugly: the candidate is shown their entire CV
 * pasted into "Skills" and a referee's address as their own email. Detecting
 * it and declining to guess is much better than confidently producing
 * nonsense — a correction UI only helps someone who can see what is wrong,
 * and nobody proof-reads a wall of text they did not expect.
 *
 * The signal is proportion. When sections are found correctly, no single one
 * holds most of the document.
 */
/**
 * How many lines each kind of section can plausibly hold.
 *
 * These are statements about what the sections of a CV actually look like,
 * not thresholds tuned to one document. Nobody lists thirty lines of
 * languages. When a section blows past its ceiling, the heading was not
 * where the parser thought it was — which is exactly what a column-ordered
 * PDF produces, and what a single global ratio misses when the overflow is
 * split across two sections that each stay under half the document.
 */
const PLAUSIBLE_SECTION_LINES: Record<string, number> = {
  languages: 10,
  certifications: 25,
  education: 30,
  skills: 30,
  // Experience is genuinely long on a senior CV, so it is bounded only by
  // the global share check below.
  experience: Number.POSITIVE_INFINITY,
  references: Number.POSITIVE_INFINITY,
};

export function looksReliablyOrdered(text: string, sections: Record<string, string[]>): boolean {
  const bodyLines = text.split("\n").filter((line) => line.trim().length > 0).length;
  // Too short to judge; a brief note has no sections to get wrong.
  if (bodyLines < 8) return true;

  const sizes = Object.values(sections).map((lines) => lines.length);
  if (sizes.length === 0) return true;

  for (const [section, lines] of Object.entries(sections)) {
    const ceiling = PLAUSIBLE_SECTION_LINES[section] ?? 30;
    if (lines.length > ceiling) return false;
  }

  // And the blunt check as well: one section holding more than half of every
  // non-empty line means the parser lost the plot, not that someone wrote a
  // CV that was 60% experience.
  return Math.max(...sizes) / bodyLines <= 0.5;
}

/**
 * The candidate's name. The heuristic — the first short line before any
 * contact detail — is weak, which is exactly why it is emitted with low
 * confidence and flagged for review rather than quietly trusted.
 */
function guessName(text: string): string | null {
  const lines = text.split("\n").map((line) => line.trim());

  // A designed CV usually sets the name in letter-spaced capitals, and that
  // tracking is a strong signal wherever it appears. Checked before position,
  // because in a multi-column layout the name is often nowhere near the top
  // of the extracted text — it can land on the last line.
  for (const line of lines) {
    if (!/^(?:[A-Z]\s+){4,}[A-Z]\s*$/.test(line)) continue;
    const collapsed = collapseLetterSpacing(line).trim();
    const words = collapsed.split(/\s+/);
    if (words.length >= 2 && words.length <= 5 && collapsed.length <= 60) {
      return toTitleCase(collapsed);
    }
  }

  for (const candidate of lines.slice(0, 6)) {
    if (candidate.length < 3 || candidate.length > 60) continue;
    if (EMAIL.test(candidate) || /\d/.test(candidate)) continue;
    if (/^(curriculum|cv|resume|r[ée]sum[ée])\b/i.test(candidate)) continue;
    // A comma or slash means a list. This is what stops "MongoDB, SQL Server"
    // — the first line of a two-column CV whose skills column is drawn first
    // — from being presented to someone as their own name.
    if (/[,;:/&|]/.test(candidate)) continue;
    const words = candidate.split(/\s+/);
    if (words.length >= 2 && words.length <= 5) return candidate;
  }
  return null;
}

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/(^|\s)(\p{L})/gu, (_, lead: string, letter: string) => lead + letter.toUpperCase());
}

/**
 * Local parts belonging to an organisation rather than a person. A CV's
 * references block carries the referee's work address, and taking the first
 * email on the page hands the candidate their referee's contact details.
 */
const GENERIC_EMAIL_LOCALS =
  /^(info|contact|hello|office|sales|support|admin|hr|jobs|recruitment|no-?reply)$/i;

/**
 * Choose the candidate's own email from every address on the page.
 *
 * Preference order: an address whose local part shares a distinctive word
 * with their name, then any non-generic address, then whatever is left. A CV
 * carrying only a referee's address still yields something; one carrying
 * both now yields the right one.
 */
export function pickOwnEmail(text: string, name: string | null): string | null {
  const all = [...text.matchAll(new RegExp(EMAIL.source, "g"))].map((match) => match[0]);
  if (all.length === 0) return null;

  const nameWords = (name ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length >= 4);

  const matchesName = all.find((email) => {
    const local = email.split("@")[0].toLowerCase();
    return nameWords.some((word) => local.includes(word) || word.includes(local));
  });
  if (matchesName) return matchesName;

  return all.find((email) => !GENERIC_EMAIL_LOCALS.test(email.split("@")[0])) ?? all[0];
}

/**
 * Languages, found anywhere in the document.
 *
 * Deliberately not restricted to a `LANGUAGES` section. `Dutch → good (B2
 * level)` is unambiguous wherever it appears, and in a multi-column CV it
 * routinely appears nowhere near its heading — in the sample that prompted
 * this, the three language lines were scattered through the experience text.
 * Requiring a proficiency marker on the same segment is what keeps this from
 * matching a passing mention of "English" in a job description.
 */
function extractLanguagesAnywhere(text: string): CandidateProfileContent["languages"] {
  const found = new Map<string, CandidateProfileContent["languages"][number]>();

  for (const rawLine of text.split("\n")) {
    // Column-merged lines glue several statements together, so each line is
    // split further before matching.
    for (const segment of rawLine.split(/[•·]|(?<=\))\s*(?=[A-Z])/)) {
      const lower = foldAccents(segment);
      const proficiency = PROFICIENCY_HINTS.find((hint) => hint.pattern.test(segment))?.value;
      if (!proficiency) continue;

      for (const [name, { code, label }] of Object.entries(LANGUAGE_NAMES)) {
        if (!lower.includes(name)) continue;
        const existing = found.get(code);
        if (!existing || existing.proficiency === null) {
          found.set(code, { code, label, proficiency });
        }
      }
    }
  }
  return [...found.values()].slice(0, 20);
}

function extractLanguagesFromSection(
  sections: Record<string, string[]>,
): CandidateProfileContent["languages"] {
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
      // The filter matters more than the split: CV skill sections are full of
      // prose bullets, and without it every clause of every sentence lands in
      // the candidate's skill list.
      if (!looksLikeSkill(item)) continue;
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

  // Whether the text came out in reading order decides how much of it can be
  // trusted. Section-derived fields depend entirely on that ordering;
  // pattern-derived ones do not, and are read either way.
  const orderedLayout = looksReliablyOrdered(text, sections);

  const name = guessName(text);
  if (name) {
    draft.fullName = name;
    confidence.fullName = CONFIDENCE.guess;
  }

  // Resolved against the name, so a referee's address is not mistaken for the
  // candidate's own.
  const email = pickOwnEmail(text, name);
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

  // A language with a proficiency marker is unambiguous wherever it sits, so
  // this runs on the whole document; the section is a fallback for entries
  // that list a language with no level.
  const fromSection = extractLanguagesFromSection(sections);
  const anywhere = extractLanguagesAnywhere(text);
  const byCode = new Map(fromSection.map((language) => [language.code, language]));
  for (const language of anywhere) byCode.set(language.code, language);
  draft.languages = [...byCode.values()].slice(0, 20);
  if (draft.languages.length > 0) confidence.languages = CONFIDENCE.section;

  if (!orderedLayout) {
    // Everything below reads from sections, and the sections are wrong. The
    // candidate gets the fields that are safe, an empty form for the rest,
    // and an explicit note that the layout could not be read — far more
    // useful than their whole CV pasted into "Skills".
    return { content: parseProfileContent(draft), confidence, layoutReliable: false };
  }

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
  return { content: parseProfileContent(draft), confidence, layoutReliable: true };
}
