import { requirementId } from "../selection/requirements";
import { requirementTerms, termStems } from "../selection/requirements";
import { degreeRequirement, educationMeets } from "../selection/degrees";
import { contentStems } from "../jobFit";
import {
  FIT_CONTRACT_VERSION,
  MAX_MODEL_REQUIREMENTS,
  type FitAnalysis,
  type FitAssessmentItem,
  type FitCategory,
  type FitCitation,
  type FitFlag,
  type FitMethod,
  type FitModelOutput,
  type FitRequirement,
  type FitSource,
} from "./contract";

/**
 * Checks a model's (or the keyword check's) structured output against the
 * server-owned inputs (#971) and turns it into a `FitAnalysis`.
 *
 * A valid reference alone does not prove a conclusion, so the checks are
 * about the conclusion too:
 *
 * - A requirement's quote must be in the posting, or it is dropped.
 * - A citation must name a known source and quote text that is in it.
 * - "direct" or "partial" without a valid citation becomes unknown.
 * - "direct" needs a term the requirement and the cited text share, or a
 *   named equivalence whose two terms are in the requirement and the cited
 *   text; otherwise it becomes unknown ("unexplained_match").
 * - A credential, degree, language or work preference must be judged from
 *   a source of the matching kind ("wrong_source_kind").
 * - "unmet" needs negative evidence: a cited text that says no, or the
 *   candidate's own answer. Otherwise it is unknown: silence is never a no.
 * - "conflict" needs at least one valid citation.
 *
 * Every downgrade is counted and flagged, never silent.
 */

export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟«»]/g, '"')
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim();
}

/** A quote as compared: bullets, trailing ellipsis and edge punctuation off. */
function quoteKey(quote: string): string {
  return normalizeForMatch(quote)
    .replace(/^(?:[-*•·▪◦‣]|\d+[.)])\s+/, "")
    .replace(/(?:\.\.\.)+$/, "")
    .replace(/^[\s"'(]+|[\s"'.,;:)]+$/g, "");
}

export function quoteIsIn(quote: string, text: string): boolean {
  const key = quoteKey(quote);
  return key.length >= 2 && normalizeForMatch(text).includes(key);
}

/** Negation cues in the cited text, EN/NL/FR/DE (#930's set). */
const NEGATION = /(?:^|[^\p{L}])(?:no|not|never|none|without|lack(?:s|ing)?|geen|niet|nooit|zonder|pas|jamais|sans|aucune?|kein(?:e|en|er)?|nicht|nie|ohne)(?=$|[^\p{L}])/iu;

/** Which source kinds may back a category. Missing: any. */
function allowedSource(category: FitCategory, sourceId: string): boolean {
  const kind = sourceId.split(":")[0]!;
  if (kind === "ev" || kind === "answer") return true;
  switch (category) {
    case "credential":
      return sourceId === "certs" || kind === "edu" || kind === "exp";
    case "education":
      return kind === "edu" || sourceId === "certs";
    case "language":
      return sourceId === "languages" || sourceId === "summary" || kind === "exp" || sourceId === "headline";
    case "location":
    case "work_arrangement":
      return kind === "pref";
    case "authorization":
      return sourceId === "work_auth";
    case "availability":
      return kind === "pref";
    default:
      return kind !== "pref";
  }
}

/** Requirements that ask about a protected trait. Shown, never scored. */
const PROTECTED =
  /\b(?:age[ds]? (?:between|under|over|\d)|years old|\d+\s*-\s*\d+ years of age|gender|male|female|nationality|citizen of|religio\w*|married|marital|pregnan\w*|disabilit\w*|health condition|ethnic\w*|leeftijd|jaar oud|geslacht|nationaliteit|godsdienst|getrouwd|zwanger|handicap|sexe|nationalit[ée]|religion|mari[ée]e?|enceinte|alter (?:zwischen|bis|von)|jahre alt|geschlecht|staatsangeh[öo]rigkeit|religion|verheiratet|schwanger|behinderung)\b/i;

export function looksProtected(quote: string): boolean {
  return PROTECTED.test(quote.normalize("NFC"));
}

export interface ValidateInput {
  output: FitModelOutput;
  jobText: string;
  sources: FitSource[];
  method: FitMethod;
  completeness: { jobTruncated: boolean; profileSentencesOmitted: number };
}

function sharesTerm(requirementQuote: string, citations: FitCitation[]): boolean {
  const wanted = new Set([...contentStems(requirementQuote), ...termStems(requirementQuote)].filter((t) => t.length >= 2));
  for (const c of citations) {
    for (const stem of termStems(c.quote)) if (wanted.has(stem) && stem.length >= 2) return true;
  }
  return false;
}

/** A degree requirement met by a cited education entry at or above its
 *  level (the #960 rule): "PhD" never shares a word with "master". */
function degreeMetBy(requirementQuote: string, citations: FitCitation[], sourceById: Map<string, FitSource>): boolean {
  const degree = degreeRequirement({ text: requirementQuote, terms: requirementTerms(requirementQuote).slice(0, 12) });
  if (!degree) return false;
  return citations.some((c) => {
    const source = sourceById.get(c.sourceId);
    return Boolean(source && c.sourceId.startsWith("edu:") && educationMeets(degree, source.text, termStems(source.text)));
  });
}

export function validateFitOutput(input: ValidateInput): FitAnalysis {
  const { output, jobText, sources } = input;
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  let requirementsRejected = 0;
  let citationsRejected = 0;
  let judgmentsDowngraded = 0;

  // Requirements: quoted from the posting, deduplicated by stable id.
  const byKey = new Map<string, FitRequirement>();
  const seen = new Set<string>();
  const requirements: FitRequirement[] = [];
  for (const r of output.requirements) {
    if (!quoteIsIn(r.quote, jobText)) {
      requirementsRejected += 1;
      continue;
    }
    const id = requirementId(r.quote);
    if (seen.has(id)) {
      // A repeated requirement: the first one stands for both.
      byKey.set(r.key, requirements.find((q) => q.id === id)!);
      continue;
    }
    seen.add(id);
    const requirement: FitRequirement = {
      id,
      quote: r.quote.replace(/\s+/g, " ").trim(),
      priority: r.priority,
      category: r.category,
      essential: r.essential,
      groupId: r.anyOf,
      protectedTrait: looksProtected(r.quote),
    };
    byKey.set(r.key, requirement);
    requirements.push(requirement);
  }
  // A group with a single surviving member is no group.
  const groupSizes = new Map<string, number>();
  for (const r of requirements) if (r.groupId) groupSizes.set(r.groupId, (groupSizes.get(r.groupId) ?? 0) + 1);
  for (const r of requirements) if (r.groupId && (groupSizes.get(r.groupId) ?? 0) < 2) r.groupId = null;

  const assessments = new Map<string, FitAssessmentItem>();
  for (const a of output.assessments) {
    const requirement = byKey.get(a.key);
    if (!requirement || assessments.has(requirement.id)) continue;
    const flags = new Set<FitFlag>();
    const citations: FitCitation[] = [];
    for (const c of a.citations) {
      const source = sourceById.get(c.sourceId);
      if (!source || !quoteIsIn(c.quote, source.text)) {
        citationsRejected += 1;
        flags.add("invalid_citation");
        continue;
      }
      if (!allowedSource(requirement.category, c.sourceId)) {
        flags.add("wrong_source_kind");
        continue;
      }
      citations.push({ sourceId: c.sourceId, quote: c.quote.replace(/\s+/g, " ").trim() });
    }

    let judgment = a.judgment;
    let equivalence = a.equivalence;
    if (equivalence) {
      const okJob = quoteIsIn(equivalence.jobTerm, requirement.quote);
      const okProfile = citations.some((c) => quoteIsIn(equivalence!.profileTerm, c.quote));
      if (!okJob || !okProfile) equivalence = null;
    }
    const downgrade = (flag: FitFlag) => {
      flags.add(flag);
      judgment = "unknown";
      judgmentsDowngraded += 1;
    };
    if ((judgment === "direct" || judgment === "partial") && citations.length === 0) {
      downgrade(flags.has("wrong_source_kind") ? "wrong_source_kind" : "unsupported_claim");
    } else if (judgment === "direct" && !equivalence && !sharesTerm(requirement.quote, citations) && !degreeMetBy(requirement.quote, citations, sourceById)) {
      downgrade("unexplained_match");
    } else if (judgment === "unmet" && !citations.some((c) => c.sourceId.startsWith("answer:") || NEGATION.test(c.quote))) {
      downgrade("unmet_without_evidence");
    } else if (judgment === "conflict" && citations.length === 0) {
      downgrade("unsupported_claim");
    }
    assessments.set(requirement.id, {
      requirementId: requirement.id,
      judgment,
      citations: judgment === "unknown" ? [] : citations,
      explanation: a.explanation.replace(/\s+/g, " ").trim(),
      equivalence: judgment === "unknown" ? null : equivalence,
      flags: [...flags],
    });
  }

  const items: FitAssessmentItem[] = requirements.map(
    (r) =>
      assessments.get(r.id) ?? {
        requirementId: r.id,
        judgment: "unknown",
        citations: [],
        explanation: "",
        equivalence: null,
        flags: ["not_assessed"],
      },
  );

  return {
    version: FIT_CONTRACT_VERSION,
    method: input.method,
    requirements,
    assessments: items,
    completeness: {
      jobTruncated: input.completeness.jobTruncated,
      profileSentencesOmitted: input.completeness.profileSentencesOmitted,
      requirementsCapped: output.moreRequirementsOmitted || output.requirements.length >= MAX_MODEL_REQUIREMENTS,
    },
    validation: { requirementsRejected, citationsRejected, judgmentsDowngraded },
  };
}
