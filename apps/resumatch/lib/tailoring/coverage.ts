/**
 * Word helpers for the key-term scope check (lib/tailoring/jobFit.ts).
 *
 * Until 0.7.5 this module also built the CV preview's "Coverage of this
 * posting" report (#428): a share of the CV's skills whose words appeared
 * in the posting, and the posting's frequent words as "not covered". It
 * read as a fit score while measuring neither fit nor the job's actual
 * requirements, so #973 removed it; the preview shows the CV's recorded
 * job fit assessment (lib/tailoring/fit/savedCv.ts) instead.
 */

// English, Dutch, and French function words — this app fetches job postings
// from Belgian boards (VDAB, Actiris, Le Forem) as often as English-language
// ones, and an untranslated stopword list leaks "een"/"van"/"het" or
// "le"/"de"/"vous" through as if they were meaningful missing keywords,
// which is exactly the kind of low-quality result that undermines trust in
// a "coverage report" feature.
export const STOPWORDS = new Set([
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
export function fold(token: string): string {
  return token.normalize("NFD").replace(/\p{M}/gu, "");
}

/**
 * Words as written (lower-cased). Split on Unicode letters, not [a-z]:
 * the ASCII-only split cut accented words apart ("équipe" → "quipe",
 * "für" → "f" + "r"), so French and German keywords came out as fragments.
 */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}+#.]+/u)
    .map((t) => t.replace(/^[.+#]+|[.+#]+$/g, ""))
    .filter((t) => t.length >= 3);
}
