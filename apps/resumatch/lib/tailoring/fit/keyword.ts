import { splitSentences } from "../ai/coverLetter/claims";
import { MAX_REQUIREMENTS, termStems } from "../selection/requirements";
import type { RequirementCoverage, TailoringSelection } from "../selection/select";
import type { FitCategory, FitJudgment, FitModelOutput, FitSource } from "./contract";

/**
 * The basic keyword check (#971), in the same output shape the AI returns,
 * so it runs through the same validation, overlay and rubric. Deterministic
 * and free: #930's lexical requirement extraction and coverage.
 *
 * Used for three things, always labelled as what it is:
 * - the result shown before (or instead of) an AI analysis, as "Basic
 *   keyword check", never as AI analysis;
 * - the fallback when the provider fails, is out of budget or replies
 *   with something invalid;
 * - the `fixture` provider, so tests and local runs exercise the full path.
 *
 * It cannot see synonyms, other languages or transferable experience: a
 * requirement it cannot match by words is unknown, never unmet.
 */

const CATEGORY_RULES: [FitCategory, RegExp][] = [
  ["language", /\b(?:fluent|native|bilingual|dutch|english|french|german|nederlands|engels|frans|duits|anglais|fran[cç]ais|n[ée]erlandais|allemand|deutsch|englisch|franz[öo]sisch|niederl[äa]ndisch|taal|langue|sprache|c1|c2|b1|b2)\b/i],
  ["credential", /\b(?:licen[cs]e|certifi\w+|accredit\w*|registered|erkenning|attest|rijbewijs|permis|brevet|zertifi\w+|f[üu]hrerschein|zulassung)\b/i],
  ["education", /\b(?:degree|bachelor|master|msc|bsc|phd|diploma|graduat\w*|universit\w*|opleiding|diplôme|dipl[oô]me|licence|abschluss|studium|hochschule)\b/i],
  ["work_arrangement", /\b(?:remote|hybrid|on-?site|office|thuiswerk|op kantoor|t[ée]l[ée]travail|sur site|homeoffice|vor ort|ploegen|shifts?|weekend|nacht|night)\b/i],
  ["authorization", /\b(?:work permit|right to work|authori[sz]ation to work|sponsorship|visa|werkvergunning|permis de travail|arbeitserlaubnis)\b/i],
  ["availability", /\b(?:available|availability|start date|immediately|beschikbaar|disponible|verf[üu]gbar)\b/i],
  ["experience", /\b(?:\d+\+?\s*(?:years?|yrs|jaar|ans|jahre)|experience|ervaring|exp[ée]rience|erfahrung)\b/i],
];

export function guessCategory(text: string): FitCategory {
  for (const [category, rule] of CATEGORY_RULES) if (rule.test(text)) return category;
  return "skill";
}

/** The sentence of `source` that best shows one of `terms`, or null. */
function quoteFrom(source: FitSource | undefined, terms: string[], negative: boolean): string | null {
  if (!source) return null;
  const sentences = splitSentences(source.text.normalize("NFC"));
  const wanted = new Set(terms);
  const negation = /(?:^|[^\p{L}])(?:no|not|never|without|geen|niet|zonder|sans|aucune?|kein(?:e|en|er)?|nicht|ohne)(?=$|[^\p{L}])/iu;
  for (const sentence of sentences) {
    const stems = termStems(sentence);
    if (![...wanted].some((t) => stems.has(t))) continue;
    if (negative !== negation.test(sentence)) continue;
    return sentence.length > 280 ? sentence.slice(0, 280) : sentence;
  }
  return null;
}

function judgmentOf(c: RequirementCoverage): FitJudgment {
  if (c.status === "supported") return "direct";
  if (c.status === "unmet") return c.unmetBy === "profile" ? "unmet" : "unknown";
  if (c.status === "conflict") return c.unmetBy === "profile" ? "conflict" : "unknown";
  return "unknown";
}

const EXPLANATION: Record<FitJudgment, string> = {
  direct: "The cited text uses the same words as this requirement.",
  partial: "Related wording only.",
  unknown: "No source uses this requirement's words. The keyword check cannot see synonyms or other languages.",
  unmet: "Your profile says you do not have this.",
  conflict: "Your profile both mentions this and says you do not have it.",
};

export function keywordFitOutput(selection: TailoringSelection, sources: FitSource[]): FitModelOutput {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const terms = new Map(selection.requirements.map((r) => [r.id, r.terms]));
  const requirements: FitModelOutput["requirements"] = [];
  const assessments: FitModelOutput["assessments"] = [];
  selection.coverage.forEach((c, index) => {
    const key = `r${index + 1}`;
    const category = guessCategory(c.text);
    requirements.push({
      key,
      quote: c.text.replace(/…$/, ""),
      priority: c.priority,
      category,
      essential: c.priority === "required" && category !== "skill" && category !== "experience" && category !== "education",
      anyOf: null,
    });
    let judgment = judgmentOf(c);
    const wanted = terms.get(c.id) ?? [];
    const citations: { sourceId: string; quote: string }[] = [];
    for (const sourceId of c.sourceIds) {
      const quote = quoteFrom(byId.get(sourceId), wanted, false);
      if (quote) citations.push({ sourceId, quote });
      if (citations.length >= 2) break;
    }
    // A degree met by level (#960) shares no word with the requirement:
    // cite the education entry itself; validation applies the same rule.
    if (judgment === "direct" && citations.length === 0) {
      const edu = c.sourceIds.map((id) => byId.get(id)).find((s) => s && s.id.startsWith("edu:"));
      if (edu) citations.push({ sourceId: edu.id, quote: edu.text.replace(/\s+/g, " ").trim().slice(0, 240) });
    }
    if (judgment === "unmet" || judgment === "conflict") {
      for (const source of sources) {
        const quote = quoteFrom(source, wanted, true);
        if (quote) {
          citations.push({ sourceId: source.id, quote });
          break;
        }
      }
    }
    if (judgment === "direct" && citations.length === 0) judgment = "unknown";
    assessments.push({ key, judgment, citations: citations.slice(0, 3), explanation: EXPLANATION[judgment], equivalence: null });
  });
  return { requirements, moreRequirementsOmitted: selection.requirements.length >= MAX_REQUIREMENTS, assessments };
}
