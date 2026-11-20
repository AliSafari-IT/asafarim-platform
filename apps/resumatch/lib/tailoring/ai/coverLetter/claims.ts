/**
 * Claim-level grounding for cover-letter prose (the #529 check's blind spot).
 *
 * `grounding.ts` catches invented *names and numbers*: a mid-sentence proper
 * noun or a number that appears in neither the profile nor the job. It
 * cannot catch an invented *responsibility* written in ordinary lower-case
 * words — "I also mentor developers", "I led a team of five engineers"
 * passes the token check as long as "five" is spelled out. Those are the
 * claims a recruiter asks about in an interview, so they matter more than
 * most.
 *
 * This module looks for a closed list of high-risk claim kinds (mentoring,
 * training people, people leadership, hiring, spoken languages,
 * certifications, awards, publications, patents, conference talks) and
 * requires evidence for each in the **profile text only**. The job text is
 * deliberately not evidence here: a posting that asks for "training Sales
 * and partners" is exactly what tempts a model to claim the candidate
 * already does it.
 *
 * **What happens on a miss.** The *sentence* that makes the claim is
 * removed; the rest of its paragraph is kept. A paragraph left empty is
 * dropped. Nothing is ever rewritten or added. The count is returned so the
 * review screen can tell the candidate something was taken out.
 *
 * **Known trade-offs, accepted.**
 * - Lenient evidence: any mention of the stem in the profile ("coached",
 *   "mentoring") backs the claim. This is a fabrication check, not a
 *   fact-checker; it stops claims with no basis at all.
 * - False removals: a sentence that mentions mentoring without claiming it
 *   ("I would value the mentoring culture at Acme") is removed too when the
 *   profile never mentions mentoring. Losing one honest sentence the
 *   candidate can re-add while reviewing is a far smaller harm than sending
 *   an invented one under their name.
 * - Claim patterns cover English, Dutch, French and German wording for the
 *   commonest phrasings, not every possible one.
 */

interface ClaimRule {
  id: string;
  /** Matches a sentence that makes this kind of claim. */
  claim: RegExp;
  /** Matches profile text that backs it. */
  evidence: RegExp;
}

const PEOPLE =
  "(?:developers?|engineers?|colleagues?|teams?|staff|juniors?|interns?|students?|people|new\\s+hires|team\\s+members|ontwikkelaars|collega'?s|medewerkers|stagiair\\w*|développeurs|collègues|stagiaires|équipes?|entwickler\\w*|kollegen|mitarbeiter\\w*|praktikant\\w*)";
const GAP = "(?:[\\w'-]+\\s+){0,3}?";

export const CLAIM_RULES: readonly ClaimRule[] = [
  {
    id: "mentoring",
    claim: /\b(?:mentor\w*|coach(?:es|ed|ing)?|tutor(?:s|ed|ing)?|begeleid\w*|encadr\w*|betreu\w*)\b/i,
    evidence: /mentor|coach|tutor|begeleid|encadr|betreu/i,
  },
  {
    id: "training_people",
    claim: new RegExp(
      `\\b(?:train(?:s|ed|ing)?|teach(?:es|ing)?|taught|onboard(?:s|ed|ing)?|upskill\\w*|lectur\\w*|opgeleid|opleiden|leid\\w*\\s+op|form(?:e|é|ée|er|ons)|schul(?:e|t|te|ten|en)|unterricht\\w*)\\s+${GAP}${PEOPLE}\\b`,
      "i",
    ),
    evidence: /train|teach|taught|onboard|upskill|lectur|workshop|instruct|opleid|opgeleid|formation|formateur|form[ée]|schul|unterricht|mentor|coach/i,
  },
  {
    id: "people_leadership",
    claim: new RegExp(
      `\\b(?:manag(?:e|es|ed|ing)|lead(?:s|ing)?|led|supervis\\w*|head(?:s|ed|ing)?|direct(?:s|ed|ing)?|leid(?:de|t|en)?|dirig\\w*|g[ée]r(?:e|é|er|ais)|leit(?:e|et|ete)?|f[üu]hr(?:e|t|te)?)\\s+(?:a\\s+|an\\s+|the\\s+|my\\s+|our\\s+|een\\s+|het\\s+|une?\\s+|l'|ein(?:e|en)?\\s+)?${GAP}${PEOPLE}\\b|\\b(?:team\\s*lead(?:er)?|teamleider|tech(?:nical)?\\s+lead|line\\s+manag\\w*|people\\s+manag\\w*|direct\\s+reports|chef\\s+d'[ée]quipe|teamleiter\\w*|leidinggev\\w*)\\b`,
      "i",
    ),
    evidence: new RegExp(
      `\\b(?:manag\\w*|lead\\w*|led|supervis\\w*|head\\w*|leid\\w*|dirig\\w*|g[ée]r\\w*|leit\\w*|f[üu]hr\\w*)\\s+${GAP}${PEOPLE}|team\\s*lead|teamleider|tech(?:nical)?\\s+lead|lead\\s+(?:developer|engineer)|\\bmanager\\b|head\\s+of|leidinggev|chef\\s+d'[ée]quipe|teamleiter|direct\\s+reports`,
      "i",
    ),
  },
  {
    id: "hiring",
    claim: new RegExp(`\\b(?:hired|hire|hiring|recruited|recruit(?:s|ing)?|interviewed|aangenomen|geworven|recrut\\w*|eingestellt|rekrutiert)\\s+${GAP}${PEOPLE}\\b`, "i"),
    evidence: /\bhir(?:e|ed|ing)\b|recruit|interview|werv|recrut|rekrut|einstell/i,
  },
  {
    id: "certification",
    claim: /\b(?:certified|certification|certificate|gecertificeerd|certificaat|certifi[ée]e?|zertifiziert|zertifikat)\b/i,
    evidence: /certif|zertif/i,
  },
  {
    id: "award",
    claim: /\b(?:award(?:s|ed)?|prize|prijs|bekroond|prix|récompens\w*|preis|ausgezeichnet)\b/i,
    evidence: /award|prize|prijs|bekroond|prix|récompens|preis|ausgezeichnet/i,
  },
  {
    id: "publication",
    claim: /\b(?:published|publication|publications|peer-reviewed|gepubliceerd|publicatie\w*|publi[ée]e?s?|veröffentlich\w*)\b/i,
    evidence: /publi|paper|article|artikel|journal|veröffentlich/i,
  },
  {
    id: "patent",
    claim: /\b(?:patent\w*|octrooi\w*|brevet\w*)\b/i,
    evidence: /patent|octrooi|brevet/i,
  },
  {
    id: "public_speaking",
    claim: /\b(?:spoke|speaker|keynote|presented|gave\s+(?:a\s+)?talks?|sprak|spreker|conférencier|intervenant|vortrag\w*|referent\w*)\b[^.!?]*\b(?:conferences?|meetups?|summits?|events?|congres\w*|conférences?|konferenz\w*)\b/i,
    evidence: /conferen|meetup|summit|keynote|speaker|spreker|congres|konferenz|vortrag|talk/i,
  },
];

/** Spoken-language names in the four letter languages, by ISO 639-1 code. */
const LANGUAGE_NAMES: Record<string, string[]> = {
  en: ["english", "engels", "anglais", "englisch"],
  nl: ["dutch", "flemish", "nederlands", "vlaams", "néerlandais", "neerlandais", "flamand", "niederländisch", "flämisch"],
  fr: ["french", "frans", "français", "francais", "französisch"],
  de: ["german", "duits", "allemand", "deutsch"],
  es: ["spanish", "spaans", "espagnol", "spanisch", "español"],
  it: ["italian", "italiaans", "italien", "italienisch"],
  pt: ["portuguese", "portugees", "portugais", "portugiesisch"],
  ar: ["arabic", "arabisch", "arabe"],
  fa: ["persian", "farsi", "perzisch", "persan", "persisch"],
  tr: ["turkish", "turks", "turc", "türkisch"],
  ru: ["russian", "russisch", "russe"],
  zh: ["chinese", "mandarin", "chinees", "chinois", "chinesisch"],
  lb: ["luxembourgish", "luxemburgs", "luxembourgeois", "luxemburgisch"],
  pl: ["polish", "pools", "polonais", "polnisch"],
};
const NAME_TO_CODE = new Map(Object.entries(LANGUAGE_NAMES).flatMap(([code, names]) => names.map((name) => [name, code] as const)));

/**
 * "I speak Dutch and English", "fluent in French": every language named in a
 * spoken-language claim must be named in the profile text too, in any of the
 * four letter languages ("Nederlands" in the profile backs "Dutch" in an
 * English letter). buildProfileText writes the profile's languages as a
 * "Languages: …" line, so the profile text is enough evidence.
 */
const LANGUAGE_CLAIM =
  /\b(?:speak|spreek|parle|spreche|fluent|native\s+speaker|proficient\s+in|bilingual|vloeiend|couramment|courant\s+en|fließend|beherrsch\w*)\b([^.!?]*)/i;

function languageCodesIn(textLower: string): Set<string> {
  const codes = new Set<string>();
  for (const word of textLower.match(/\p{L}+/gu) ?? []) {
    const code = NAME_TO_CODE.get(word);
    if (code) codes.add(code);
  }
  return codes;
}

function spokenLanguageClaimUnbacked(sentence: string, profileCodes: ReadonlySet<string>): boolean {
  const match = LANGUAGE_CLAIM.exec(sentence);
  if (!match) return false;
  for (const code of languageCodesIn(match[1]!.toLowerCase())) {
    if (!profileCodes.has(code)) return true;
  }
  return false;
}

export interface ClaimEvidence {
  /** The profile text the prompt was built from (buildProfileText). */
  profileText: string;
  /** Spoken languages named in it — derived once by claimEvidence(). */
  languageCodes: ReadonlySet<string>;
}

export function claimEvidence(profileText: string): ClaimEvidence {
  return { profileText, languageCodes: languageCodesIn(profileText.toLowerCase()) };
}

const ABBREVIATION = /\b(?:e\.g|i\.e|etc|vs|approx|incl|Dr|Mr|Mrs|Ms|Prof|St|bijv|o\.a|m\.a\.w|d\.w\.z|z\.B|bzw|usw|p\.ex|c\.-à-d|env)\.$/i;

/** Sentence split that leaves "ASP.NET", "Node.js" and "e.g." alone. */
export function splitSentences(paragraph: string): string[] {
  const pieces = paragraph.split(/(?<=[.!?])\s+(?=[\p{Lu}\d"“'(])/u);
  const sentences: string[] = [];
  for (const piece of pieces) {
    const previous = sentences.at(-1);
    if (previous !== undefined && ABBREVIATION.test(previous)) sentences[sentences.length - 1] = `${previous} ${piece}`;
    else sentences.push(piece);
  }
  return sentences.map((s) => s.trim()).filter((s) => s.length > 0);
}

/** The rule ids a sentence breaks, given the profile's evidence. */
export function unbackedClaims(sentence: string, evidence: ClaimEvidence): string[] {
  const broken: string[] = [];
  for (const rule of CLAIM_RULES) {
    if (rule.claim.test(sentence) && !rule.evidence.test(evidence.profileText)) broken.push(rule.id);
  }
  if (spokenLanguageClaimUnbacked(sentence, evidence.languageCodes)) broken.push("spoken_language");
  return broken;
}

export interface ClaimStripResult {
  /** The paragraph with unbacked sentences removed, or null when none is left. */
  paragraph: string | null;
  removedSentences: number;
  /** Rule ids, for logging only. */
  rules: string[];
}

export function stripUnbackedClaims(paragraph: string, evidence: ClaimEvidence): ClaimStripResult {
  const kept: string[] = [];
  const rules: string[] = [];
  let removedSentences = 0;
  for (const sentence of splitSentences(paragraph)) {
    const broken = unbackedClaims(sentence, evidence);
    if (broken.length > 0) {
      removedSentences += 1;
      rules.push(...broken);
    } else {
      kept.push(sentence);
    }
  }
  return { paragraph: kept.length > 0 ? kept.join(" ") : null, removedSentences, rules };
}
