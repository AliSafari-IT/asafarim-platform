import type { CandidateProfileContent } from "../profile/contract";
import { fold, STOPWORDS, words as coverageWords } from "./coverage";
import { withoutFileHeaders } from "./jobFiles";

/**
 * Job fit check: does this posting look like it is within the candidate's
 * scope at all? Deterministic, no provider call, no persistence. It reads
 * the confirmed profile and the job's own text and runs before any AI spend,
 * so it works the same when AI tailoring is unavailable (degraded).
 *
 * A low fit is a warning, never a block: the candidate is asked whether they
 * still want to apply, and only an explicit yes lets the tailoring call run
 * (generate-preview refuses a low-fit job without `proceedDespiteLowFit`).
 * The tailoring prompt then leads with transferable strengths, under the same
 * "nothing the profile doesn't state" rules as every other run.
 *
 * The signal is the posting's own key terms: its most frequent non-generic
 * words, compared against everything the profile says about the candidate's
 * work (headline, summary, skills, experience, education, certifications).
 * Rough on purpose. It is there to catch "nurse" against a software
 * developer's profile, not to rank close candidates.
 */

/** Generic job-ad vocabulary that says nothing about the work itself, on top
 *  of coverage.ts's function words. Unaccented: tokens are folded first. */
const JOB_AD_STOPWORDS = new Set([
  // English
  "candidate", "candidates", "company", "offer", "offers", "looking", "profile",
  "position", "apply", "application", "applications", "salary", "contract",
  "full", "time", "part", "benefits", "opportunity", "opportunities", "join",
  "responsibilities", "requirements", "required", "requirement", "knowledge",
  "strong", "good", "excellent", "great", "new", "help", "make", "more",
  "also", "well", "like", "per", "day", "days", "week", "weeks", "hours",
  "location", "based", "us", "we're", "you'll", "you're", "ideal", "plus",
  "preferred", "minimum", "least", "ability", "environment", "within",
  "level", "high", "range", "competitive", "package", "employer", "equal",
  "please", "send", "cv", "resume", "letter", "cover", "click", "here",
  "now", "today", "one", "two", "three", "first", "may", "need", "needs",
  "want", "get", "use", "using", "used", "both", "very", "most", "much",
  "many", "every", "own", "own", "way", "part", "people", "person", "colleagues",
  "description", "summary", "about", "join", "vacancy", "vacancies", "hiring",
  "permanent", "temporary", "remote", "hybrid", "onsite", "office", "monday",
  "friday", "salary", "eur", "euro", "euros", "gross", "month", "monthly",
  "annual", "yearly", "start", "starting", "date", "deadline", "contact",
  "cookie", "cookies", "privacy", "policy", "share", "save", "jobs",
  "and/or", "m/f", "m/v", "m/w", "h/f", "f/m",
  // Dutch
  "kandidaat", "kandidaten", "bedrijf", "onderneming", "aanbod", "profiel",
  "solliciteer", "solliciteren", "sollicitatie", "contract", "voltijds",
  "deeltijds", "goede", "goed", "sterke", "kennis", "nieuwe", "nieuw", "jij",
  "wij", "ons", "zoeken", "zoekt", "hebt", "heb", "bent", "biedt", "bieden",
  "word", "wordt", "jouw", "taken", "takenpakket", "vereisten", "vacature",
  "vacatures", "loon", "salaris", "uur", "uren", "week", "dag", "dagen",
  "mee", "meer", "zeer", "heel", "graag", "willen", "wil", "jouw", "gaan",
  "gaat", "staat", "plaats", "regio", "minimum", "minstens", "pluspunt",
  "contacteer", "contact", "doet", "hebben", "kunnen", "zal", "zullen",
  "onbepaalde", "bepaalde", "duur", "statuut", "werkgever", "medewerker",
  "medewerkers", "collega", "collegas", "omgeving", "mogelijkheid",
  "mogelijkheden", "uitdaging", "uitdagende", "aantrekkelijk", "verloning",
  "werkt", "werken", "dient", "staan", "centraal", "samen", "nauw",
  // French
  "candidat", "candidate", "candidats", "entreprise", "societe", "offre",
  "profil", "postuler", "candidature", "contrat", "temps", "plein", "partiel",
  "connaissance", "connaissances", "bonne", "bon", "bons", "bonnes", "vos",
  "nos", "recherchons", "cherchons", "recherche", "etre", "avoir", "tout",
  "tous", "toute", "toutes", "tres", "travail", "travailler", "mission",
  "missions", "salaire", "heures", "semaine", "jour", "jours", "lieu",
  "minimum", "atout", "atouts", "contactez", "duree", "indeterminee",
  "determinee", "employeur", "collaborateur", "collaborateurs", "collegues",
  "environnement", "possibilite", "possibilites", "attractif", "votre",
  "notre", "vous", "qui", "que", "aux", "par", "une", "afin", "ainsi",
  // German
  "bewerber", "bewerberin", "unternehmen", "firma", "angebot", "profil",
  "bewerbung", "bewerben", "vertrag", "vollzeit", "teilzeit", "gute", "gut",
  "guter", "gutes", "sehr", "kenntnis", "wir", "suchen", "bieten", "dich",
  "dir", "deine", "dein", "deiner", "sich", "haben", "sein", "ihnen",
  "aufgaben", "anforderungen", "stellenangebot", "gehalt", "stunden", "woche",
  "tag", "tage", "standort", "mindestens", "plus", "kontakt", "kontaktieren",
  "unbefristet", "befristet", "arbeitgeber", "mitarbeiter", "mitarbeiterin",
  "kollegen", "umfeld", "moglichkeit", "moglichkeiten", "attraktive",
  "attraktives", "zusammenarbeit", "freuen", "uns", "unseren", "unserem",
]);

export type JobFitLevel = "strong" | "partial" | "low" | "unknown";

export interface JobFitExperience {
  title: string;
  employer: string | null;
}

export interface JobFit {
  /** "unknown" when there is too little on either side to judge: an almost
   *  empty profile, or a posting with hardly any readable text. Never warns. */
  level: JobFitLevel;
  /** Share (0–100) of the posting's key-term mentions the profile covers. */
  score: number;
  /** Posting key terms the profile also mentions, most frequent first. */
  matchedTerms: string[];
  /** Posting key terms the profile never mentions, most frequent first. */
  missingTerms: string[];
  /** The candidate's own skill names that the posting mentions. */
  matchedSkills: string[];
  /** Up to two experience entries that overlap the posting most: what an
   *  off-scope CV leads with. Empty when none overlap at all. */
  closestExperience: JobFitExperience[];
  /** How many posting key terms were compared. */
  termsConsidered: number;
}

/** How many of the posting's most frequent terms are compared. */
export const KEY_TERM_COUNT = 25;
/** Below this many key terms a posting is too thin to judge. */
const MIN_KEY_TERMS = 8;
/** Below this score a job is "low" fit, unless enough skills match. */
export const LOW_FIT_SCORE = 20;
/** At or above this score a job is a "strong" fit. */
export const STRONG_FIT_SCORE = 45;
/** A posting naming this many of the candidate's own skills is never "low". */
const SKILLS_THAT_RULE_OUT_LOW = 3;
const MAX_LISTED_TERMS = 10;

/**
 * coverage.ts's words, plus short technical names it drops: "C++", "C#",
 * "CI/CD", "UI/UX". Kept separate so the coverage report doesn't change.
 * A token with one of + # / survives at two characters or more; plain
 * words still need three.
 */
function words(text: string): string[] {
  // NFC first: a decomposed accent ("E\u0301") would otherwise split the
  // word before fold() removes it, so "Électronique" typed two ways would
  // give two different stems.
  const nfc = text.normalize("NFC");
  const technical = nfc
    .toLowerCase()
    .split(/[^\p{L}\p{N}+#./]+/u)
    .map((t) => t.replace(/^[./]+|[./]+$/g, ""))
    .filter((t) => /[+#/]/.test(t) && t.length >= 2 && /\p{L}/u.test(t) && !t.includes("//"));
  return [...coverageWords(nfc), ...technical];
}

/**
 * A light stem so "developer"/"development" and "postgres"/"postgresql"
 * compare equal across languages, without a per-language stemmer. Long
 * words share a six-letter prefix; short ones must match exactly, after a
 * plural "s" is dropped ("tests" → "test").
 */
function stem(folded: string): string {
  const singular = folded.length >= 4 && folded.endsWith("s") && !folded.endsWith("ss") ? folded.slice(0, -1) : folded;
  return singular.length >= 7 ? singular.slice(0, 6) : singular;
}

function stems(text: string): Set<string> {
  return new Set(words(text).map((w) => stem(fold(w))));
}

function isGeneric(folded: string): boolean {
  return STOPWORDS.has(folded) || JOB_AD_STOPWORDS.has(folded) || /^\d+$/.test(folded);
}

/** The stems of every word in `text`, generic ones included: what a
 *  source can be searched for (#930 evidence selection). */
export function textStems(text: string): Set<string> {
  return stems(text);
}

/** The non-generic stems of `text`, in first-seen order: what a job
 *  requirement is about (#930). */
export function contentStems(text: string): string[] {
  const seen = new Set<string>();
  for (const word of words(text)) {
    const folded = fold(word);
    if (isGeneric(folded)) continue;
    seen.add(stem(folded));
  }
  return [...seen];
}

/** The posting's key terms: folded stem → total count + first spelling seen. */
function keyTerms(jobText: string): { stem: string; display: string; count: number }[] {
  const byStem = new Map<string, { stem: string; display: string; count: number }>();
  for (const word of words(jobText)) {
    const folded = fold(word);
    if (isGeneric(folded)) continue;
    const key = stem(folded);
    const entry = byStem.get(key);
    if (entry) entry.count += 1;
    else byStem.set(key, { stem: key, display: word, count: 1 });
  }
  return [...byStem.values()]
    .sort((a, b) => b.count - a.count || a.display.localeCompare(b.display))
    .slice(0, KEY_TERM_COUNT);
}

/** Everything the profile says about the candidate's work, and nothing
 *  else: no name, contact details, location or preferences. */
function profileEvidenceText(profile: CandidateProfileContent): string {
  return [
    profile.headline,
    profile.summary,
    ...profile.skills.map((s) => s.name),
    ...profile.experience.flatMap((e) => [e.title, e.summary]),
    ...profile.education.map((e) => e.qualification),
    ...profile.certifications.map((c) => c.name),
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n");
}

export function assessJobFit(profile: CandidateProfileContent, postingText: string): JobFit {
  // An uploaded set's file headers are names, not posting words.
  const jobText = withoutFileHeaders(postingText);
  const evidence = profileEvidenceText(profile);
  const profileStems = stems(evidence);
  const terms = keyTerms(jobText);
  const jobStems = new Set(terms.map((t) => t.stem));
  const allJobStems = stems(jobText);

  const matchedSkills = profile.skills
    .map((s) => s.name)
    .filter((name) => {
      const skillStems = [...stems(name)];
      return skillStems.length > 0 && skillStems.every((s) => allJobStems.has(s));
    });

  const matched = terms.filter((t) => profileStems.has(t.stem));
  const missing = terms.filter((t) => !profileStems.has(t.stem));
  const total = terms.reduce((n, t) => n + t.count, 0);
  const covered = matched.reduce((n, t) => n + t.count, 0);
  const score = total > 0 ? Math.round((covered / total) * 100) : 0;

  const closestExperience = profile.experience
    .map((entry, index) => {
      const entryStems = stems([entry.title, entry.summary].filter(Boolean).join(" "));
      let overlap = 0;
      for (const s of entryStems) if (jobStems.has(s)) overlap += 1;
      return { entry, index, overlap };
    })
    .filter((e) => e.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || a.index - b.index)
    .slice(0, 2)
    .map(({ entry }) => ({ title: entry.title, employer: entry.employer }));

  const profileTooThin = profileStems.size < 5;
  const level: JobFitLevel =
    profileTooThin || terms.length < MIN_KEY_TERMS
      ? "unknown"
      : score >= STRONG_FIT_SCORE
        ? "strong"
        : score < LOW_FIT_SCORE && matchedSkills.length < SKILLS_THAT_RULE_OUT_LOW
          ? "low"
          : "partial";

  return {
    level,
    score,
    matchedTerms: matched.slice(0, MAX_LISTED_TERMS).map((t) => t.display),
    missingTerms: missing.slice(0, MAX_LISTED_TERMS).map((t) => t.display),
    matchedSkills,
    closestExperience,
    termsConsidered: terms.length,
  };
}
