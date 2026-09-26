/**
 * Deterministic keyword/skill coverage report (issue #428). No provider
 * call, no persistence — computed at render time from the target job's own
 * text and the tailored resume's already-persisted content, the same
 * "derived, not stored" option the issue itself allows for.
 *
 * Fits the no-fabrication boundary the rest of tailoring enforces: this
 * describes the profile's real coverage of the posting — matched and
 * missing — and adds nothing to the document itself. A gap the profile
 * genuinely has stays a gap; nothing here silently patches it.
 */

// English, Dutch, and French function words — this app fetches job postings
// from Belgian boards (VDAB, Actiris, Le Forem) as often as English-language
// ones, and an untranslated stopword list leaks "een"/"van"/"het" or
// "le"/"de"/"vous" through as if they were meaningful missing keywords,
// which is exactly the kind of low-quality result that undermines trust in
// a "coverage report" feature.
const STOPWORDS = new Set([
  // English
  "the", "and", "for", "with", "you", "your", "our", "are", "will", "have",
  "this", "that", "from", "into", "who", "what", "when", "where", "why", "how",
  "can", "able", "must", "should", "would", "could", "not", "but", "all",
  "any", "each", "other", "some", "such", "than", "then", "them", "they",
  "their", "about", "across", "after", "before", "between", "during", "over",
  "under", "within", "without", "job", "role", "team", "work", "working",
  "experience", "years", "year", "skills", "skill", "including", "etc",
  "www", "com", "https", "http",
  // Dutch
  "een", "van", "het", "met", "voor", "als", "naar", "uit", "aan", "bij",
  "over", "door", "deze", "dit", "dat", "die", "zijn", "wordt", "worden",
  "ook", "maar", "niet", "geen", "wel", "kan", "kunt", "moet", "moeten",
  "onze", "jouw", "jullie", "hun", "wat", "waar", "hoe", "waarom", "welke",
  "functie", "werk", "team", "jaar", "jaren", "ervaring", "vaardigheden",
  "binnen", "tussen", "tijdens", "zonder", "andere", "sommige",
  // French
  "le", "la", "les", "des", "une", "vous", "nous", "votre", "notre", "avec",
  "pour", "dans", "sur", "cette", "cet", "ces", "leur", "leurs", "est",
  "sont", "ont", "peut", "peuvent", "doit", "doivent", "ainsi", "mais",
  "pas", "plus", "sans", "entre", "pendant", "autre", "autres", "poste",
  "equipe", "annee", "annees", "experience", "competences",
  // German (#641). Written unaccented, like the French above: tokens are
  // accent-folded before this lookup, so "für"/"über"/"können" match.
  "der", "die", "das", "und", "mit", "fur", "von", "den", "dem", "des",
  "ein", "eine", "einen", "einem", "einer", "sie", "wir", "ihr", "ihre",
  "unser", "unsere", "ist", "sind", "wird", "werden", "kann", "konnen",
  "muss", "mussen", "auch", "aber", "nicht", "kein", "keine", "oder", "als",
  "bei", "aus", "nach", "uber", "unter", "zwischen", "wahrend", "ohne",
  "andere", "sowie", "zur", "zum", "stelle", "jahr", "jahre", "erfahrung",
  "kenntnisse",
]);

/** Accent-folded comparison key: "équipe" → "equipe", "für" → "fur". */
function fold(token: string): string {
  return token.normalize("NFD").replace(/\p{M}/gu, "");
}

/**
 * Words as written (lower-cased). Split on Unicode letters, not [a-z]:
 * the ASCII-only split cut accented words apart ("équipe" → "quipe",
 * "für" → "f" + "r"), so French and German keywords came out as fragments.
 */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}+#.]+/u)
    .map((t) => t.replace(/^[.+#]+|[.+#]+$/g, ""))
    .filter((t) => t.length >= 3);
}

function tokenize(text: string): string[] {
  return words(text).map(fold);
}

/** Folded key → how often it appears and the first spelling seen, so the
 *  gap list shows "développement", not a folded "developpement". */
function significantJobTokens(jobText: string): Map<string, { count: number; display: string }> {
  const counts = new Map<string, { count: number; display: string }>();
  for (const word of words(jobText)) {
    const key = fold(word);
    if (STOPWORDS.has(key)) continue;
    if (/^\d+$/.test(key)) continue;
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { count: 1, display: word });
  }
  return counts;
}

export interface CoverageReport {
  /** The candidate's own skills that the posting's text also mentions. */
  matchedSkills: string[];
  /** The posting's own frequent, non-generic terms that neither the
   *  candidate's skills nor the rest of the resume text mention anywhere —
   *  an honest gap list, capped so it reads as "what to consider
   *  addressing" rather than a raw keyword dump. */
  missingKeywords: string[];
  /** matchedSkills.length / total profile skills, 0 when there are none —
   *  a rough coverage signal, not a calibrated "ATS score". */
  matchPercent: number;
}

const MAX_MISSING_KEYWORDS = 12;

export function computeCoverage(profileSkills: string[], jobText: string, resumeText: string): CoverageReport {
  const jobTokenCounts = significantJobTokens(jobText);
  const jobTokens = new Set(jobTokenCounts.keys());
  const resumeTokens = new Set(tokenize(resumeText));

  const matchedSkills = profileSkills.filter((skill) => tokenize(skill).some((t) => jobTokens.has(t)));

  const missingKeywords = [...jobTokenCounts.entries()]
    .filter(([token]) => !resumeTokens.has(token))
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, MAX_MISSING_KEYWORDS)
    .map(([, { display }]) => display);

  return {
    matchedSkills,
    missingKeywords,
    matchPercent: profileSkills.length > 0 ? Math.round((matchedSkills.length / profileSkills.length) * 100) : 0,
  };
}
