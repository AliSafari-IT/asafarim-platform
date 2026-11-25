import { contentStems } from "../jobFit";
import { requirementTerms, type JobRequirement } from "./requirements";

/**
 * Degree requirements ("Bachelor- of masterdiploma", "Master's degree in
 * Computer Science", "PhD preferred") read against the candidate's
 * education entries, by level. Deterministic, no model call.
 *
 * Plain term matching misses these: a CV says "MSc", "BSc" or "PhD" where a
 * posting says "master", "bachelor" or "diploma", and a doctorate holder
 * is asked whether they have a bachelor's degree. Here both sides are read
 * as a level, and an education entry at or above the lowest level the
 * requirement names meets it ("bachelor or master" is met by either, and a
 * doctorate also meets "a master's degree").
 *
 * No-fabrication: only the candidate's own education entries count (never
 * a summary or a role), only a degree the entry itself names, and any field
 * the requirement names ("in Computer Science") must be named by that same
 * entry. Anything less stays as before, so the candidate is still asked.
 */

/** 1 bachelor, 2 master, 3 doctorate. 0: "a degree" or "a diploma" with no
 *  level, which any recognised degree meets. */
export type DegreeLevel = 0 | 1 | 2 | 3;

const SUFFIX = "(?:s|diploma|opleiding|niveau|graad|titel|degree|abschluss|studium|studies)?";

/** Folded single words that name a degree level (EN, NL, FR, DE). Words
 *  only, never stems: "licentie" (a licence) is not "licentiaat". */
const LEVEL_WORDS: [RegExp, DegreeLevel][] = [
  [/^(?:phd|ph\.d|dphil|doctorate|doctoraat|doctorat|doktor|doktorat|doctoral|doctor)$/, 3],
  [new RegExp(`^master${SUFFIX}$`), 2],
  [/^(?:msc|m\.sc|meng|m\.eng|mba|licentiaat|maitrise|bac\+5|masterarbeit)$/, 2],
  [new RegExp(`^bachelor${SUFFIX}$`), 1],
  [/^(?:bsc|b\.sc|beng|b\.eng|bba|bachelier|bac\+3|hochschulabschluss|studienabschluss)$/, 1],
  [/^(?:degree|degrees|diploma|diplomas|diplome|diplomes|abschluss)$/, 0],
];

/** "Scrum Master", "master data", "web master": not a degree. */
const NOT_DEGREE_BEFORE = new Set(["scrum", "web", "quiz", "grand", "chess", "head", "ring", "task", "post", "station", "burgo", "harbour", "harbor", "toast", "concert"]);
const NOT_DEGREE_AFTER = new Set(["data", "branch", "class", "classes", "plan", "planning", "schedule", "key", "keys", "record", "records", "file", "files", "node", "nodes", "list", "page", "copy", "volume"]);

/** "Higher education" names a kind of degree, not a subject; "a Master in
 *  Education" does name one, so the word alone is never fluff. */
const LEVEL_PHRASE = /\b(?:hoger|hogere|higher|universitair|universitaire|university)\s+(?:onderwijs|education)\b|\benseignement\s+sup[eé]rieur\b/giu;

/** Words around a degree that say nothing about its subject. A field the
 *  requirement names is any other term. */
const FLUFF = new Set(
  contentStems(
    "hoger hogere higher minimum minimaal minstens least relevant relevante equivalent equivalente gelijkwaardig gelijkwaardige " +
      "gelijkaardig gelijkaardige vergelijkbaar vergelijkbare similar richting domein domain field fields related verwant verwante " +
      "aanverwant aanverwante niveau level academic academisch academische university universitair universitaire universiteit " +
      "hogeschool college opleiding studie studies afgestudeerd graduate graduated obtained behaald behaalde " +
      "experience ervaring werkervaring preferably required vereist recognised recognized erkend erkende completed afgerond",
  ),
);

function fold(text: string): string {
  return text.normalize("NFC").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function wordsOf(text: string): string[] {
  return fold(text)
    .split(/[^\p{L}\p{N}+.]+/u)
    .map((w) => w.replace(/^\.+|\.+$/g, ""))
    .filter(Boolean);
}

/** Every degree word in a text, with its level. */
function degreeWords(text: string): { word: string; level: DegreeLevel }[] {
  const words = wordsOf(text);
  const found: { word: string; level: DegreeLevel }[] = [];
  words.forEach((word, index) => {
    const hit = LEVEL_WORDS.find(([pattern]) => pattern.test(word));
    if (!hit) return;
    if (word.startsWith("master") && (NOT_DEGREE_BEFORE.has(words[index - 1] ?? "") || NOT_DEGREE_AFTER.has(words[index + 1] ?? ""))) return;
    found.push({ word, level: hit[1] });
  });
  return found;
}

/** The highest degree level an education entry names, or null for none
 *  ("Applied Information Technology", a course, a certificate). A bare
 *  "diploma" or "degree" there says nothing about level, so it is not one. */
export function educationLevel(text: string): DegreeLevel | null {
  const levels = degreeWords(text).map((d) => d.level).filter((level) => level > 0);
  return levels.length > 0 ? (Math.max(...levels) as DegreeLevel) : null;
}

export interface DegreeRequirement {
  /** The lowest level that meets it: the lowest it names, since levels in
   *  one requirement are alternatives ("bachelor of master"). */
  level: DegreeLevel;
  /** Requirement terms that are the degree itself. */
  degreeTerms: string[];
  /** Requirement terms that name a subject, which the same education
   *  entry has to name too. */
  fieldTerms: string[];
}

/** The degree a requirement asks for, or null when it asks for none. */
export function degreeRequirement(requirement: Pick<JobRequirement, "text" | "terms">): DegreeRequirement | null {
  const found = degreeWords(requirement.text);
  if (found.length === 0) return null;
  const levelled = found.map((d) => d.level).filter((level) => level > 0);
  const level = (levelled.length > 0 ? Math.min(...levelled) : 0) as DegreeLevel;
  const degreeStems = new Set(found.flatMap((d) => requirementTerms(d.word)));
  const subject = new Set(requirementTerms(requirement.text.normalize("NFC").replace(LEVEL_PHRASE, " ")));
  const degreeTerms = requirement.terms.filter((t) => degreeStems.has(t) || !subject.has(t));
  const fieldTerms = requirement.terms.filter((t) => !degreeStems.has(t) && subject.has(t) && !FLUFF.has(t));
  return { level, degreeTerms, fieldTerms };
}

/** Whether an education entry meets a degree requirement: at or above its
 *  level, and naming every field term. `stems` are the entry's own. */
export function educationMeets(degree: DegreeRequirement, entryText: string, stems: Set<string>): boolean {
  const level = educationLevel(entryText);
  if (level === null || level < Math.max(degree.level, 1)) return false;
  return degree.fieldTerms.every((t) => stems.has(t));
}
