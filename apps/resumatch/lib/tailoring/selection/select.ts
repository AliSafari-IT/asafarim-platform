import { capWithMarker } from "../../ai/promptKit";
import type { CandidateProfileContent } from "../../profile/contract";
import { evidenceSourceId, renderProfessionalEvidence, type GenerationEvidence } from "../../evidence/prompt";
import { assertNoContactDetails, buildProfileUnits, unitText, type ProfileUnit } from "../buildProfileText";
import { splitSentences } from "../ai/coverLetter/claims";
import { contentStems } from "../jobFit";
import { extractRequirements, termStems, yearMentions, type JobRequirement } from "./requirements";

/**
 * Requirement-to-evidence selection (#930). Deterministic, no model call.
 *
 * Before #930 the profile and the job were cut at a fixed length (8,000 and
 * 6,000 characters), so evidence near the end of a long CV, and requirements
 * near the end of a long posting, never reached the model. This stage
 * instead:
 *
 * 1. reads the job's requirements (requirements.ts), each with a stable id;
 * 2. keeps every structural part of the profile whole (headline, skills,
 *    every role's title, employer and dates, education, certifications),
 *    so `experienceBullets[i]` still lines up with `profile.experience[i]`;
 * 3. when the profile is over budget, drops the *least relevant* prose
 *    sentences first (role and profile summaries), never a header, so a
 *    relevant sentence late in the CV survives;
 * 4. tags every line with a stable source id (`exp:2`, `skills`,
 *    `ev:<revision id>`) the model cites for each claim;
 * 5. marks each requirement supported, unknown, unmet or conflict.
 *    Absence is "unknown", never "unmet": only the candidate's own answer,
 *    or their own profile saying so, makes a requirement unmet.
 */

export const SELECTION_VERSION = "evidence_selection@1";
/** Same budgets as the old prefix caps, so prompt size and cost stay bounded. */
export const MAX_SELECTED_PROFILE_CHARS = 8000;
export const MAX_SELECTED_JOB_CHARS = 6000;
/** Clarification questions per run, at most (#930: "at most three"). */
export const MAX_QUESTIONS = 3;
/** Unmet requirement ids one request may carry. */
export const MAX_UNMET_REQUIREMENTS = 12;

export type RequirementStatus = "supported" | "unknown" | "unmet" | "conflict";

export interface RequirementCoverage {
  id: string;
  text: string;
  priority: JobRequirement["priority"];
  status: RequirementStatus;
  /** Source ids whose text supports it (at most three), best first. */
  sourceIds: string[];
  /** Requirement terms no source mentions. */
  missingTerms: string[];
  /** Why it is unmet or in conflict: the candidate said so, or the
   *  profile itself does ("No Kubernetes experience"). */
  unmetBy: "candidate" | "profile" | null;
}

export interface SelectedSource {
  id: string;
  kind: "profile" | "evidence";
  /** The full text of the source: what a claim citing it is checked
   *  against. Full, not the shortened prompt copy: a claim backed by a
   *  sentence that selection left out is still true. */
  text: string;
  /** The role this source belongs to (`exp:` units and role-linked
   *  evidence), or null. */
  roleIndex: number | null;
  /** A short label for the review screen. Built from the candidate's own
   *  data, never from model output. */
  label: string;
}

export interface TailoringSelection {
  version: string;
  requirements: JobRequirement[];
  coverage: RequirementCoverage[];
  /** Profile text for the CV prompt: one line per source, tagged `[id]`. */
  profileText: string;
  /** The same selection without tags, for the cover letter. */
  plainProfileText: string;
  /** The confirmed-evidence block for the CV prompt, tagged; null: none. */
  evidenceText: string | null;
  /** Requirements the CV must never claim (unmet or in conflict), as the
   *  fenced block the prompt gets; null when there are none. */
  gapsText: string | null;
  /** The job text the prompts get. */
  jobTextUsed: string;
  /** Every source id a claim may cite, with its text. */
  sources: SelectedSource[];
  /** Prose sentences left out to fit the budget. */
  omittedSentences: number;
}

export interface SelectionInput {
  profile: CandidateProfileContent;
  jobText: string;
  evidence: GenerationEvidence;
  /** Requirement ids the candidate answered "no" to. Ids the job does not
   *  have are ignored. */
  unmetRequirementIds?: readonly string[];
  profileBudget?: number;
  jobBudget?: number;
}

/** Negation in a sentence turns a mention into a denial: "No Kubernetes
 *  experience", "geen ervaring met SAP", "sans expérience", "keine Kenntnisse". */
const NEGATION = /(?:^|[^\p{L}])(?:no|not|never|none|without|lack(?:s|ing)?|geen|niet|nooit|zonder|pas|jamais|sans|aucune?|kein(?:e|en|er)?|nicht|nie|ohne)(?=$|[^\p{L}])/iu;

/** The terms requirements are about, weighted: required ×2, preferred ×1.
 *  A posting with no recognisable requirements falls back to its own
 *  non-generic words, so relevance still means something. */
export function requirementWeights(requirements: JobRequirement[], jobText: string): Map<string, number> {
  const weights = new Map<string, number>();
  if (requirements.length === 0) {
    for (const term of contentStems(jobText).slice(0, 60)) weights.set(term, 1);
    return weights;
  }
  for (const requirement of requirements) {
    for (const term of requirement.terms) weights.set(term, (weights.get(term) ?? 0) + (requirement.priority === "required" ? 2 : 1));
  }
  return weights;
}

/** How relevant a piece of text is to the job: the summed weight of the
 *  requirement terms it mentions. */
export function relevanceScorer(weights: Map<string, number>): (text: string) => number {
  return (text: string) => {
    let score = 0;
    for (const term of termStems(text)) score += weights.get(term) ?? 0;
    return score;
  };
}

/**
 * How confirmed evidence is ranked for one job (#930). Preview, job-fit and
 * generate-confirm's staleness re-check must all use this one function, or
 * an unchanged evidence list over budget could keep different items and a
 * save would be refused as stale.
 */
export function evidenceRelevanceForJob(jobText: string): (text: string) => number {
  return relevanceScorer(requirementWeights(extractRequirements(jobText), jobText));
}

/** Square brackets in the candidate's own text become parentheses, so a
 *  CV line can never look like a source tag such as "[exp:1]". */
function untag(text: string): string {
  return text.replace(/\[/g, "(").replace(/\]/g, ")");
}

interface ProseUnit {
  unit: ProfileUnit;
  sentences: { text: string; score: number; kept: boolean }[];
}

function renderUnits(prose: ProseUnit[], tagged: boolean): string {
  return prose
    .map(({ unit, sentences }) => {
      const kept = sentences.filter((s) => s.kept).map((s) => s.text);
      const shortened = kept.length < sentences.length;
      const body = kept.length > 0 ? `${kept.join(" ")}${shortened ? " (…)" : ""}` : sentences.length > 0 ? "(…)" : null;
      const line = untag(unitText(unit, body));
      return tagged ? `[${unit.id}] ${line}` : line;
    })
    .join("\n");
}

/**
 * Drop the least relevant prose sentences until the tagged text fits the
 * budget. Order of removal: lowest score first; among equal scores, later
 * units (older roles) and later sentences first. Each unit keeps at least
 * one sentence until every unit is down to one; then whole bodies go,
 * least relevant first. Headers are never dropped. If headers alone are
 * still over budget (a pathological profile), the text is capped with a
 * marker as before.
 */
function fitToBudget(prose: ProseUnit[], budget: number): number {
  const size = () => renderUnits(prose, true).length;
  if (size() <= budget) return 0;
  const all = prose.flatMap((p, unitIndex) => p.sentences.map((s, sentenceIndex) => ({ p, s, unitIndex, sentenceIndex })));
  const order = [...all].sort((a, b) => a.s.score - b.s.score || b.unitIndex - a.unitIndex || b.sentenceIndex - a.sentenceIndex);
  let omitted = 0;
  for (const pass of [1, 0]) {
    for (const candidate of order) {
      if (!candidate.s.kept) continue;
      if (candidate.p.sentences.filter((s) => s.kept).length <= pass) continue;
      candidate.s.kept = false;
      omitted += 1;
      if (size() <= budget) return omitted;
    }
  }
  return omitted;
}

function selectJobText(jobText: string, requirements: JobRequirement[], budget: number): string {
  if (jobText.length <= budget) return jobText;
  // The opening (title, company, summary) plus every requirement line the
  // opening does not already hold.
  const head = capWithMarker(jobText, Math.floor(budget * 0.55));
  const missing = requirements.filter((r) => !head.includes(r.text.replace(/…$/, ""))).map((r) => `- ${r.text}`);
  const tail = missing.length > 0 ? `\n[… requirements from later in the posting:]\n${missing.join("\n")}` : "";
  return capWithMarker(`${head}${tail}`, budget);
}

interface SentenceWord {
  stems: Set<string>;
  index: number;
}

interface SentenceFacts {
  text: string;
  stems: Set<string>;
  words: SentenceWord[];
  years: { years: number; index: number }[];
}

function sentenceFacts(text: string): SentenceFacts[] {
  return splitSentences(text).map((sentence) => ({
    text: sentence,
    stems: termStems(sentence),
    words: [...sentence.matchAll(/[\p{L}\p{N}][\p{L}\p{N}+#.]*/gu)].map((m) => ({ stems: termStems(m[0]), index: m.index ?? 0 })),
    years: yearMentions(sentence),
  }));
}

/** How far before a term a negation still applies, in characters. */
const NEGATION_REACH = 40;

/**
 * Whether one mention of a term is denied: a negation shortly *before* it,
 * in the same clause. "No Terraform experience" and "geen ervaring met
 * Excel" deny; "Deployed Kubernetes without downtime" does not, because
 * the negation is about something after the term.
 */
function deniedAt(sentence: string, index: number): boolean {
  const before = sentence.slice(Math.max(0, index - NEGATION_REACH), index);
  const clause = before.split(/[,;:()]/).at(-1) ?? "";
  return NEGATION.test(clause);
}

function assess(
  requirement: JobRequirement,
  sources: { id: string; facts: SentenceFacts[] }[],
  candidateSaysUnmet: boolean,
): RequirementCoverage {
  const supported = new Set<string>();
  const denied = new Set<string>();
  const bySource: { id: string; hits: number }[] = [];
  // Terms whose positive mention sits near an "N years" of at least the
  // posting's threshold.
  const yearsBacked = new Set<string>();
  for (const source of sources) {
    let hits = 0;
    for (const fact of source.facts) {
      for (const term of requirement.terms) {
        if (!fact.stems.has(term)) continue;
        for (const word of fact.words) {
          if (!word.stems.has(term)) continue;
          if (deniedAt(fact.text, word.index)) {
            denied.add(term);
            continue;
          }
          supported.add(term);
          hits += 1;
          if (requirement.minYears !== null && fact.years.some((y) => y.years >= requirement.minYears! && Math.abs(y.index - word.index) <= NEGATION_REACH)) {
            yearsBacked.add(term);
          }
        }
      }
    }
    if (hits > 0) bySource.push({ id: source.id, hits });
  }
  // Supported needs most of the terms, every distinctive one ("React and
  // TypeScript" is not met by React alone), and a stated number of years
  // when the posting sets a threshold. Anything less stays unknown, so the
  // candidate can be asked.
  const needed = Math.ceil(requirement.terms.length / 2);
  const keys = requirement.keyTerms.length > 0 ? requirement.keyTerms : requirement.terms;
  const yearsOk = requirement.minYears === null || keys.some((t) => yearsBacked.has(t));
  const isSupported = supported.size >= needed && requirement.keyTerms.every((t) => supported.has(t)) && yearsOk;
  const deniedKey = [...denied].filter((t) => keys.includes(t));
  const profileDenies = deniedKey.some((t) => !supported.has(t));
  const profileContradicts = deniedKey.length > 0 && deniedKey.every((t) => supported.has(t));
  let status: RequirementStatus;
  let unmetBy: RequirementCoverage["unmetBy"] = null;
  if (candidateSaysUnmet) {
    status = isSupported ? "conflict" : "unmet";
    unmetBy = "candidate";
  } else if (profileContradicts) {
    // The same term is both claimed and denied: the candidate decides.
    status = "conflict";
    unmetBy = "profile";
  } else if (profileDenies) {
    status = "unmet";
    unmetBy = "profile";
  } else if (isSupported) {
    status = "supported";
  } else {
    status = "unknown";
  }
  return {
    id: requirement.id,
    text: requirement.text,
    priority: requirement.priority,
    status,
    sourceIds: bySource.sort((a, b) => b.hits - a.hits).slice(0, 3).map((s) => s.id),
    missingTerms: requirement.terms.filter((t) => !supported.has(t)),
    unmetBy,
  };
}

function profileLabel(unit: ProfileUnit, profile: CandidateProfileContent): string {
  if (unit.roleIndex !== null) {
    const entry = profile.experience[unit.roleIndex]!;
    return entry.employer ? `${entry.title} · ${entry.employer}` : entry.title;
  }
  return unit.field.replace(/\[\d+\]$/, "");
}

/** Requirement coverage, given the profile, the evidence and the
 *  candidate's "no" answers. Exported for the job-fit route. */
export function selectTailoringInputs(input: SelectionInput): TailoringSelection {
  const { profile, jobText, evidence } = input;
  const requirements = extractRequirements(jobText);
  const weights = requirementWeights(requirements, jobText);
  const score = relevanceScorer(weights);

  const units = buildProfileUnits(profile);
  const prose: ProseUnit[] = units.map((unit) => ({
    unit,
    sentences: unit.body ? splitSentences(unit.body).map((text) => ({ text, score: score(text), kept: true })) : [],
  }));
  const omittedSentences = fitToBudget(prose, input.profileBudget ?? MAX_SELECTED_PROFILE_CHARS);
  let profileText = renderUnits(prose, true);
  let plainProfileText = renderUnits(prose, false);
  const budget = input.profileBudget ?? MAX_SELECTED_PROFILE_CHARS;
  if (profileText.length > budget) profileText = capWithMarker(profileText, budget);
  if (plainProfileText.length > budget) plainProfileText = capWithMarker(plainProfileText, budget);
  assertNoContactDetails(profile, profileText);
  assertNoContactDetails(profile, plainProfileText);

  const sources: SelectedSource[] = [
    ...units.map((unit) => ({
      id: unit.id,
      kind: "profile" as const,
      text: unitText(unit),
      roleIndex: unit.roleIndex,
      label: profileLabel(unit, profile),
    })),
    ...evidence.professional.map((item) => ({
      id: evidenceSourceId(item.revisionId),
      kind: "evidence" as const,
      text: `${item.title}. ${item.detail}`,
      roleIndex: item.roleIndex,
      label: item.title,
    })),
  ];

  const unmet = new Set(input.unmetRequirementIds ?? []);
  const factsBySource = sources.map((source) => ({ id: source.id, facts: sentenceFacts(source.text) }));
  const coverage = requirements.map((requirement) => assess(requirement, factsBySource, unmet.has(requirement.id)));

  const gaps = coverage.filter((c) => c.status === "unmet" || c.status === "conflict");
  const gapsText = gaps.length > 0 ? gaps.map((g) => `- ${g.text}`).join("\n") : null;

  return {
    version: SELECTION_VERSION,
    requirements,
    coverage,
    profileText,
    plainProfileText,
    evidenceText: renderProfessionalEvidence(evidence, true),
    gapsText,
    jobTextUsed: selectJobText(jobText, requirements, input.jobBudget ?? MAX_SELECTED_JOB_CHARS),
    sources,
    omittedSentences,
  };
}

export interface ClarificationQuestion {
  requirementId: string;
  text: string;
  priority: JobRequirement["priority"];
}

/**
 * At most three optional questions, for requirements nothing in the profile
 * or confirmed evidence mentions: required ones first, then posting order.
 * A requirement the candidate already answered, or one the profile already
 * supports or denies, is never asked about. Skipping every question is
 * always allowed; the run then treats them as unknown and claims nothing.
 */
export function clarificationQuestions(coverage: RequirementCoverage[], max = MAX_QUESTIONS): ClarificationQuestion[] {
  return coverage
    .map((c, index) => ({ c, index }))
    .filter(({ c }) => c.status === "unknown")
    .sort((a, b) => (a.c.priority === b.c.priority ? a.index - b.index : a.c.priority === "required" ? -1 : 1))
    .slice(0, Math.min(max, MAX_QUESTIONS))
    .map(({ c }) => ({ requirementId: c.id, text: c.text, priority: c.priority }));
}

/** Validates the client's "no" answers: strings, deduplicated, bounded, and
 *  only ids this job's requirements actually have. Null for a malformed body. */
export function parseUnmetRequirementIds(value: unknown, requirements: JobRequirement[]): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_UNMET_REQUIREMENTS) return null;
  if (!value.every((id) => typeof id === "string" && id.length <= 40)) return null;
  const known = new Set(requirements.map((r) => r.id));
  return [...new Set(value as string[])].filter((id) => known.has(id));
}
