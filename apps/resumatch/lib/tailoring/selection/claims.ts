import { ungroundedProseTokens } from "../../extraction/ai/grounding";
import { claimEvidence, splitSentences, unbackedClaimMatches } from "../ai/coverLetter/claims";
import type { TailorSuggestions } from "../ai/schema";
import type { OutputLanguage } from "../language";
import { termStems, type JobRequirement } from "./requirements";
import type { RequirementCoverage, SelectedSource } from "./select";

/**
 * Source references and the claim check for CV suggestions (#930).
 *
 * The model cites, for the headline, the summary and every bullet, the
 * source ids it drew on. This module checks every claim against those
 * citations, in code:
 *
 * - **Valid references.** An id must be one the prompt actually had. A
 *   bullet of role i must cite role i (`exp:i`) or confirmed evidence linked
 *   to role i; citing another role, or evidence with no single role, is the
 *   misalignment #929 forbids.
 * - **References are not proof.** A valid id says where a claim should come
 *   from, not that it follows. So the claim's numbers and names must appear
 *   in the cited text (the grounding bar the letter uses), its high-risk
 *   claims (mentoring, leading, certifications, spoken languages…) need
 *   backing there, and it may not mention a job requirement the cited text
 *   does not, nor one the candidate does not meet.
 * - **Flag, don't rewrite.** A claim that fails is flagged with the reasons.
 *   The review shows the flag and starts a flagged bullet unticked; nothing
 *   is reworded or added here. The merge (schema.ts) still copies every
 *   structural fact from the profile whatever this says.
 *
 * - **Exact spans (#964).** Every flag comes with the issues behind it:
 *   the exact words (offsets into the claim), why they could not be
 *   traced, and the profile text that does or does not back them, so the
 *   review can highlight the phrase instead of the whole field.
 *
 * Lexical on purpose: a reliable "no basis at all" check, not a judge of
 * meaning. A claim that passes can still be wrong, which is why the
 * candidate reviews every one.
 */

export type ClaimFlag =
  | "no_source"
  | "invalid_source"
  | "other_role"
  | "not_in_sources"
  | "unbacked_claim"
  | "unsupported_requirement"
  | "unmet_requirement";

/**
 * Why a span could not be traced (#964). Worded for the candidate as "we
 * couldn't find support", never as "this is false".
 *
 * - `number_not_found`: a number no cited text has.
 * - `name_not_in_role`: a name the profile has somewhere (skills, another
 *   role), but not in this role's own text.
 * - `name_not_found`: a name nowhere in the profile.
 * - `responsibility`: a high-risk claim (mentoring, leading, hiring,
 *   certifications, spoken languages…) the cited text does not back;
 *   `rule` says which.
 * - `requirement_not_in_role`: names a job requirement another part of the
 *   profile backs, but not this role.
 * - `requirement_not_found`: names a job requirement the profile does not
 *   mention.
 * - `requirement_unmet`: names a requirement the candidate or the profile
 *   says they do not meet, or one in conflict.
 * - `no_role_source`, `other_role`, `source_unclear`: the whole claim; the
 *   AI cited nothing from this role, another role, or ids it was not given.
 */
export type ClaimIssueReason =
  | "number_not_found"
  | "name_not_in_role"
  | "name_not_found"
  | "responsibility"
  | "requirement_not_in_role"
  | "requirement_not_found"
  | "requirement_unmet"
  | "no_role_source"
  | "other_role"
  | "source_unclear";

/** Profile text an issue points the candidate to. Only the candidate's
 *  own data: source text, never model output. */
export interface ClaimEvidenceRef {
  sourceId: string;
  /** "match": this source names the term; "context": what the profile says
   *  about the claim's own role, to compare against. */
  kind: "match" | "context";
  /** The sentence (or list) that holds it, capped. */
  excerpt: string;
}

export interface ClaimIssue {
  /** Stable for the same text: reason and offsets. */
  id: string;
  reason: ClaimIssueReason;
  /** Offsets into the claim's text; [0, length) for a whole-claim issue. */
  start: number;
  end: number;
  text: string;
  whole: boolean;
  /** `responsibility`: the claim rule (mentoring, people_leadership…). */
  rule: string | null;
  requirementId: string | null;
  requirementText: string | null;
  /** `requirement_unmet`: who said no, or "conflict". */
  unmetBy: "candidate" | "profile" | "conflict" | null;
  evidence: ClaimEvidenceRef[];
}

export interface ClaimFinding {
  field: "headline" | "summary" | "bullet";
  experienceIndex: number | null;
  bulletIndex: number | null;
  /** The valid ids it cites, in the model's order. */
  sourceIds: string[];
  flags: ClaimFlag[];
  /** #964: what exactly could not be traced; empty when nothing was. */
  issues: ClaimIssue[];
}

export interface ClaimCheck {
  claims: ClaimFinding[];
  flagged: number;
}

/** Ids a bullet may cite besides its own role without being flagged
 *  `other_role`. Citing them never backs a role fact, though: see
 *  NAME_SOURCES. */
const GENERAL_SOURCES = new Set(["headline", "summary", "skills", "languages", "certs", "work_auth"]);

/** The lists whose names (a technology, a language, a certificate) a
 *  bullet may mention without its role repeating them. The headline and
 *  summary are not among them: "Led 12 engineers" in the summary says
 *  nothing about which role it happened in. */
const NAME_SOURCES = ["skills", "languages", "certs"];

const MAX_EXCERPT_CHARS = 240;
const MAX_MATCHES = 2;

function uniq<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function textOf(ids: string[], byId: Map<string, SelectedSource>): string {
  return ids.map((id) => byId.get(id)?.text ?? "").join("\n");
}

/** Whether a claim speaks to a requirement: one of its key terms (the
 *  names that make it what it is), or, for a requirement without any, at
 *  least half its terms. A generic word alone ("experience") never counts. */
function mentionedTerms(claimStems: Set<string>, requirement: JobRequirement): string[] {
  if (requirement.keyTerms.length > 0) return requirement.keyTerms.filter((t) => claimStems.has(t));
  const hits = requirement.terms.filter((t) => claimStems.has(t));
  return hits.length > 0 && hits.length * 2 >= requirement.terms.length ? hits : [];
}

const WORD = /[\p{L}\p{N}][\p{L}\p{N}+#.]*/gu;

/** The words of `text` whose stems include one of `terms`, as spans. */
function termSpans(text: string, terms: string[]): { start: number; end: number }[] {
  const wanted = new Set(terms);
  const spans: { start: number; end: number }[] = [];
  for (const match of text.matchAll(WORD)) {
    const word = match[0].replace(/\.+$/, "");
    if ([...termStems(word)].some((stem) => wanted.has(stem))) spans.push({ start: match.index ?? 0, end: (match.index ?? 0) + word.length });
  }
  return spans;
}

/** Sentences (or lines) of a source, so an excerpt is one readable piece. */
function pieces(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function cap(text: string): string {
  return text.length > MAX_EXCERPT_CHARS ? `${text.slice(0, MAX_EXCERPT_CHARS - 1).trimEnd()}…` : text;
}

/** Where in the profile a term (a name, or requirement stems) appears,
 *  best sources first, at most MAX_MATCHES, never `exclude`. */
function findMatches(sources: SelectedSource[], test: (piece: string) => boolean, exclude: Set<string>): ClaimEvidenceRef[] {
  const refs: ClaimEvidenceRef[] = [];
  for (const source of sources) {
    if (exclude.has(source.id)) continue;
    const piece = pieces(source.text).find(test);
    if (piece) refs.push({ sourceId: source.id, kind: "match", excerpt: cap(piece) });
    if (refs.length >= MAX_MATCHES) break;
  }
  return refs;
}

/** The piece of the role's own text that shares the most words with the
 *  claim: what the candidate compares the claim against. */
function contextRef(claim: string, roleSources: SelectedSource[]): ClaimEvidenceRef[] {
  const claimStems = termStems(claim);
  let best: { sourceId: string; piece: string; score: number } | null = null;
  for (const source of roleSources) {
    for (const piece of pieces(source.text)) {
      let score = 0;
      for (const stem of termStems(piece)) if (claimStems.has(stem)) score += 1;
      if (!best || score > best.score) best = { sourceId: source.id, piece, score };
    }
  }
  return best && best.score > 0 ? [{ sourceId: best.sourceId, kind: "context", excerpt: cap(best.piece) }] : [];
}

/** The offsets of each sentence `splitSentences` returns, in order. */
function sentenceOffsets(text: string): { sentence: string; start: number }[] {
  const out: { sentence: string; start: number }[] = [];
  let from = 0;
  for (const sentence of splitSentences(text)) {
    const start = text.indexOf(sentence, from);
    // splitSentences only joins with one space; fall back to a search
    // from the last position.
    const at = start >= 0 ? start : from;
    out.push({ sentence, start: at });
    from = at + sentence.length;
  }
  return out;
}

const NAMEABLE = /^[A-Za-z]/;

interface CheckScope {
  claim: string;
  /** What backs the claim's facts. */
  sourceText: string;
  /** The ids of those sources (excluded from "found elsewhere"). */
  scopeIds: Set<string>;
  /** The role's own sources, for context; empty for headline/summary. */
  roleSources: SelectedSource[];
  mode: "prose" | "headline";
  names: string;
  sources: SelectedSource[];
  requirements: JobRequirement[];
  coverage: RequirementCoverage[];
}

type Draft = Omit<ClaimIssue, "id" | "text" | "whole" | "rule" | "requirementId" | "requirementText" | "unmetBy"> &
  Partial<Pick<ClaimIssue, "rule" | "requirementId" | "requirementText" | "unmetBy">>;

/** Higher wins when two issues cover the same words. */
const PRIORITY: Record<ClaimIssueReason, number> = {
  requirement_unmet: 9,
  responsibility: 8,
  requirement_not_found: 7,
  requirement_not_in_role: 6,
  name_not_found: 5,
  name_not_in_role: 4,
  number_not_found: 3,
  no_role_source: 2,
  other_role: 1,
  source_unclear: 0,
};

function contentCheck(scope: CheckScope): { flags: ClaimFlag[]; drafts: Draft[] } {
  const { claim, sourceText, mode, names, requirements, coverage, sources, scopeIds, roleSources } = scope;
  const flags: ClaimFlag[] = [];
  const drafts: Draft[] = [];
  const sourceLower = sourceText.toLowerCase();
  const namesLower = names.toLowerCase();
  const allLower = sources.map((s) => s.text).join("\n").toLowerCase();
  const context = contextRef(claim, roleSources);

  // Numbers and names the cited text does not have. Names the skills,
  // languages and certificates lists hold are fine in a bullet.
  const tokens = ungroundedProseTokens(claim, sourceLower, mode, namesLower ? (token) => namesLower.includes(token) : undefined);
  if (tokens.length > 0) flags.push("not_in_sources");
  for (const token of tokens) {
    const span = { start: token.index, end: token.index + token.token.length };
    if (token.isNumber) {
      drafts.push({ reason: "number_not_found", ...span, evidence: context });
      continue;
    }
    const lower = token.token.toLowerCase();
    const elsewhere = NAMEABLE.test(lower) && allLower.includes(lower)
      ? findMatches(sources, (piece) => piece.toLowerCase().includes(lower), scopeIds)
      : [];
    drafts.push(elsewhere.length > 0 ? { reason: "name_not_in_role", ...span, evidence: [...elsewhere, ...context] } : { reason: "name_not_found", ...span, evidence: context });
  }

  // High-risk claims (mentoring, leading, languages…) without backing.
  const evidence = claimEvidence(sourceText);
  let unbacked = false;
  for (const { sentence, start } of sentenceOffsets(claim)) {
    for (const match of unbackedClaimMatches(sentence, evidence)) {
      unbacked = true;
      drafts.push({ reason: "responsibility", rule: match.rule, start: start + match.index, end: start + match.index + match.length, evidence: context });
    }
  }
  if (unbacked) flags.push("unbacked_claim");

  // Job requirements the claim names.
  const claimStems = termStems(claim);
  const backing = `${sourceText}\n${names}`;
  const backingStems = termStems(backing);
  for (const requirement of requirements) {
    const covered = coverage.find((c) => c.id === requirement.id);
    const status = covered?.status ?? "unknown";
    const mentioned = mentionedTerms(claimStems, requirement);
    if (mentioned.length === 0) continue;
    const base = { requirementId: requirement.id, requirementText: requirement.text };
    // Unmet or in conflict: claiming it is wrong even when the cited text
    // names the term, because that text may be the denial itself ("No
    // Terraform experience") or the side of a conflict the candidate has
    // not settled.
    if (status === "unmet" || status === "conflict") {
      flags.push("unmet_requirement");
      const unmetBy = status === "conflict" ? "conflict" : (covered?.unmetBy ?? null);
      // Where the profile names it, the denial included, so the candidate
      // can see what to correct.
      const where = findMatches(sources, (piece) => {
        const stems = termStems(piece);
        return mentioned.every((t) => stems.has(t));
      }, new Set());
      for (const span of termSpans(claim, mentioned)) drafts.push({ reason: "requirement_unmet", ...span, ...base, unmetBy, evidence: where });
      continue;
    }
    // Supported somewhere is not supported here: a bullet that names a
    // requirement its own cited text never mentions is flagged too.
    const missing = mentioned.filter((t) => !backingStems.has(t));
    if (missing.length === 0) continue;
    flags.push("unsupported_requirement");
    const elsewhere = findMatches(sources, (piece) => {
      const stems = termStems(piece);
      return missing.every((t) => stems.has(t));
    }, scopeIds);
    for (const span of termSpans(claim, missing)) {
      drafts.push(
        elsewhere.length > 0
          ? { reason: "requirement_not_in_role", ...span, ...base, evidence: [...elsewhere, ...context] }
          : { reason: "requirement_not_found", ...span, ...base, evidence: context },
      );
    }
  }
  return { flags, drafts };
}

/** Two issues on the same words keep the higher-priority one; adjacent
 *  number pieces ("1,200") become one. */
function finalize(claim: string, drafts: Draft[]): ClaimIssue[] {
  const sorted = [...drafts].sort((a, b) => a.start - b.start || PRIORITY[b.reason] - PRIORITY[a.reason]);
  const merged: Draft[] = [];
  for (const draft of sorted) {
    const previous = merged.at(-1);
    if (
      previous &&
      previous.reason === "number_not_found" &&
      draft.reason === "number_not_found" &&
      /^[,.]?$/.test(claim.slice(previous.end, draft.start))
    ) {
      previous.end = draft.end;
      continue;
    }
    merged.push({ ...draft });
  }
  const kept: Draft[] = [];
  for (const draft of merged.sort((a, b) => PRIORITY[b.reason] - PRIORITY[a.reason] || a.start - b.start)) {
    if (kept.some((k) => k.start < draft.end && draft.start < k.end)) continue;
    kept.push(draft);
  }
  return kept
    .sort((a, b) => a.start - b.start)
    .map((draft) => {
      // A trailing "+" or "%" belongs to its number.
      let end = draft.end;
      if (draft.reason === "number_not_found") while (end < claim.length && /[+%]/.test(claim[end]!)) end += 1;
      const whole = draft.start === 0 && end >= claim.length;
      return {
        id: `${draft.reason}:${draft.start}-${end}`,
        reason: draft.reason,
        start: draft.start,
        end,
        text: claim.slice(draft.start, end),
        whole,
        rule: draft.rule ?? null,
        requirementId: draft.requirementId ?? null,
        requirementText: draft.requirementText ?? null,
        unmetBy: draft.unmetBy ?? null,
        evidence: draft.evidence,
      };
    });
}

function wholeIssue(claim: string, reason: ClaimIssueReason, evidence: ClaimEvidenceRef[] = []): ClaimIssue {
  return {
    id: `${reason}:0-${claim.length}`,
    reason,
    start: 0,
    end: claim.length,
    text: claim,
    whole: true,
    rule: null,
    requirementId: null,
    requirementText: null,
    unmetBy: null,
    evidence,
  };
}

export interface ClaimCheckInput {
  suggestions: TailorSuggestions;
  sources: SelectedSource[];
  requirements: JobRequirement[];
  coverage: RequirementCoverage[];
  outputLanguage: OutputLanguage | null;
}

interface CheckOne {
  field: "headline" | "summary" | "bullet";
  experienceIndex: number | null;
  text: string;
  /** Ids the model cited; null checks a bullet against its whole role
   *  (a candidate's edit cites nothing). */
  refs: string[] | null;
}

interface CheckEnv {
  byId: Map<string, SelectedSource>;
  sources: SelectedSource[];
  requirements: JobRequirement[];
  coverage: RequirementCoverage[];
  proseMode: "prose" | "headline";
}

function checkOne(env: CheckEnv, item: CheckOne): Omit<ClaimFinding, "bulletIndex"> {
  const { byId, sources, requirements, coverage, proseMode } = env;
  const { field, experienceIndex, text } = item;
  if (field !== "bullet") {
    const refs = item.refs ?? [];
    const valid = uniq(refs.filter((id) => byId.has(id)));
    const flags: ClaimFlag[] = refs.some((id) => !byId.has(id)) ? ["invalid_source"] : [];
    // Role-free prose may draw on the whole profile; references point the
    // candidate to the main source but do not narrow the check.
    const content = contentCheck({
      claim: text,
      sourceText: sources.map((s) => s.text).join("\n"),
      scopeIds: new Set(),
      roleSources: [],
      mode: field === "headline" ? "headline" : proseMode,
      names: "",
      sources,
      requirements,
      coverage,
    });
    flags.push(...content.flags);
    const issues = finalize(text, content.drafts);
    if (issues.length === 0 && flags.length > 0) issues.push(wholeIssue(text, "source_unclear"));
    return { field, experienceIndex: null, sourceIds: valid, flags: uniq(flags), issues };
  }

  const roleIndex = experienceIndex!;
  const ownRole = sources.filter((s) => s.roleIndex === roleIndex);
  const refs = item.refs ?? ownRole.map((s) => s.id);
  const flags: ClaimFlag[] = [];
  const valid: string[] = [];
  for (const id of uniq(refs)) {
    const source = byId.get(id);
    if (!source) {
      flags.push("invalid_source");
      continue;
    }
    if (source.roleIndex === roleIndex || GENERAL_SOURCES.has(id)) valid.push(id);
    else flags.push("other_role");
  }
  const roleSources = valid.filter((id) => byId.get(id)!.roleIndex === roleIndex);
  let issues: ClaimIssue[] = [];
  if (roleSources.length === 0) {
    flags.push("no_source");
    issues = [wholeIssue(text, flags.includes("other_role") ? "other_role" : "no_role_source", contextRef(text, ownRole))];
  } else {
    // Only the role's own text backs the bullet's facts; the lists may
    // back the names it mentions.
    const content = contentCheck({
      claim: text,
      sourceText: textOf(roleSources, byId),
      scopeIds: new Set(roleSources),
      roleSources: roleSources.map((id) => byId.get(id)!),
      mode: proseMode,
      names: textOf(NAME_SOURCES, byId),
      sources,
      requirements,
      coverage,
    });
    flags.push(...content.flags);
    issues = finalize(text, content.drafts);
    if (issues.length === 0 && flags.length > 0) issues.push(wholeIssue(text, flags.includes("other_role") ? "other_role" : "source_unclear"));
  }
  return { field, experienceIndex: roleIndex, sourceIds: valid, flags: uniq(flags), issues };
}

function envOf(input: Omit<ClaimCheckInput, "suggestions">): CheckEnv {
  return {
    byId: new Map(input.sources.map((s) => [s.id, s])),
    sources: input.sources,
    requirements: input.requirements,
    coverage: input.coverage,
    // German capitalises every noun, so capitals say nothing there: check
    // numbers and technology-shaped names only, as the letter check does.
    proseMode: input.outputLanguage === "de" ? "headline" : "prose",
  };
}

export function checkClaims({ suggestions, ...input }: ClaimCheckInput): ClaimCheck {
  const env = envOf(input);
  const cited = suggestions.sources ?? { headline: [], summary: [], experienceBullets: [] };
  const claims: ClaimFinding[] = [];

  for (const field of ["headline", "summary"] as const) {
    const text = suggestions[field];
    if (!text) continue;
    claims.push({ ...checkOne(env, { field, experienceIndex: null, text, refs: cited[field] }), bulletIndex: null });
  }

  suggestions.experienceBullets.forEach((bullets, experienceIndex) => {
    bullets.forEach((bullet, bulletIndex) => {
      if (!bullet.trim()) return;
      const refs = cited.experienceBullets[experienceIndex]?.[bulletIndex] ?? [];
      claims.push({ ...checkOne(env, { field: "bullet", experienceIndex, text: bullet, refs }), bulletIndex });
    });
  });

  return { claims, flagged: claims.filter((c) => c.flags.length > 0).length };
}

/** One edited text to check again (#964). */
export interface RecheckItem {
  field: "headline" | "summary" | "bullet";
  experienceIndex: number | null;
  text: string;
}

/**
 * Check text the candidate edited on the review, the same way as the AI's:
 * a headline or summary against the whole profile, a bullet against its
 * own role (an edit cites nothing, so the role's own sources stand in for
 * its references). Advisory, like the first check: it tells the candidate
 * whether the issue is gone, it never blocks the save.
 */
export function recheckClaims(items: RecheckItem[], input: Omit<ClaimCheckInput, "suggestions">): ClaimIssue[][] {
  const env = envOf(input);
  return items.map((item) => {
    const text = item.text;
    if (!text.trim()) return [];
    if (item.field === "bullet" && (item.experienceIndex === null || !env.sources.some((s) => s.roleIndex === item.experienceIndex))) return [];
    return checkOne(env, { ...item, refs: item.field === "bullet" ? null : [] }).issues.filter((issue) => issue.reason !== "source_unclear");
  });
}
