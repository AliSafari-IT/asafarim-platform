import type { IndexedTarget, SpecIndex } from "./specIndex";
import { matchesPropertyAlias, normalizeText } from "./specIndex";
import type { ConversationMemoryFacts } from "./memory";

/**
 * M13 slice D — deterministic target resolution.
 *
 * The M13 contract fixes the order (docs/appbuilder-m13-multimodal-
 * contextual-assistant.md, "Context and target resolution"): current
 * selection, stable id, exact property match, exact label, unique
 * case-insensitive match, recent memory, then model ranking of bounded
 * candidates. Everything up to "model ranking" happens here, in pure
 * TypeScript, against the current specification index — so "the title whose
 * value is Home" has a right answer before a provider is ever consulted, and
 * that answer is reproducible in CI without a network call.
 *
 * Two design decisions worth stating up front, because they are what make
 * the reported conversation behave:
 *
 * **Candidates carry a role.** A *subject* candidate answers "which thing
 * are we talking about". A *capability* candidate answers "which property in
 * this schema can even express the change you asked for" — e.g. a request
 * naming a colour when the only colour-valued property in the whole
 * specification is `branding.primaryColor`. Only subjects decide
 * resolved/ambiguous; capability hints ride along as context. Without that
 * split, "it is still black" would have looked like a two-way tie between
 * the remembered title and the brand colour and produced yet another
 * pointless question.
 *
 * **Nothing here mutates or authorizes anything.** The output is candidates
 * and, at most, one grounded question. The operation engine, capability
 * checks, dry run, destructive confirmation, and versioning are all
 * downstream and unchanged.
 */

export type ResolutionStrategy =
  | "selection"
  | "stable_id"
  | "exact_value"
  | "case_insensitive"
  | "memory"
  | "property_only"
  | "capability_hint"
  // M13 slice E: the user explicitly picked this target by answering a
  // clarifying question — authoritative over anything the text-based rules
  // above would otherwise conclude (see contextAssembler.ts's forcedTargetId).
  | "clarification_answer";

export type CandidateRole = "subject" | "capability";

export interface TargetCandidate {
  target: IndexedTarget;
  role: CandidateRole;
  strategy: ResolutionStrategy;
  /** 0..1. Compared against the thresholds below — never surfaced to the user as a number. */
  confidence: number;
  /** Bounded, human-readable reasons this candidate matched, in the order the rules fired. */
  evidence: string[];
}

export type TargetResolutionOutcome = "resolved" | "ambiguous" | "unresolved";

export interface TargetResolution {
  outcome: TargetResolutionOutcome;
  /** Set only on `resolved` — exactly one subject cleared both the threshold and the margin. */
  resolved: TargetCandidate | null;
  /** Ranked subjects first, then capability hints. Bounded. */
  candidates: TargetCandidate[];
  /** One grounded question naming the real competitors — never a generic "could you be more specific?". */
  question: string | null;
  /** The signals the request itself produced, exposed for observability and tests. */
  signals: RequestSignals;
}

/** A candidate must clear this to be acted on without a question. */
export const MIN_AUTO_RESOLVE_CONFIDENCE = 0.7;
/** …and must beat the runner-up by at least this much, so a near-tie asks instead of guessing. */
export const MIN_AUTO_RESOLVE_MARGIN = 0.15;

const MAX_SUBJECT_CANDIDATES = 8;
const MAX_CAPABILITY_CANDIDATES = 3;
const MAX_CANDIDATES_IN_QUESTION = 4;

const SELECTION_COMPONENT_CONFIDENCE = 0.9;
const SELECTION_PAGE_CONFIDENCE = 0.82;
const STABLE_ID_CONFIDENCE = 0.88;
const EXACT_VALUE_UNIQUE_CONFIDENCE = 0.95;
const EXACT_VALUE_SHARED_CONFIDENCE = 0.75;
const CASE_INSENSITIVE_CONFIDENCE = 0.65;
const MEMORY_CONFIDENCE = 0.72;
const PROPERTY_ONLY_CONFIDENCE = 0.7;
const CAPABILITY_HINT_CONFIDENCE = 0.6;

const PROPERTY_MATCH_BONUS = 0.1;
const PROPERTY_MISMATCH_PENALTY = 0.15;
const VISIBLE_TEXT_BONUS = 0.05;
const ARCHIVED_PENALTY = 0.2;

// ─── Request signal extraction ─────────────────────────────────────────────

export interface RequestSignals {
  /** Text the user quoted, or named after a cue like "whose value is" / "titled". Candidate *search* values. */
  valuePhrases: string[];
  /** The value the user wants to set, from an "X to Y" phrasing — deliberately excluded from search. */
  replacementValues: string[];
  /** Property words present in the request that match at least one indexed target's aliases. */
  propertyPhrases: string[];
  /** Tokens that are literally a stable id in this specification. */
  stableIdMentions: string[];
  /** Colour names/hex values the request mentions. */
  colorWords: string[];
  /** True when the request leans on a pronoun or a continuation ("it", "still", "again") and so needs memory. */
  referential: boolean;
}

const COLOR_WORDS = [
  "black", "white", "red", "orange", "yellow", "green", "blue", "purple", "violet",
  "pink", "grey", "gray", "brown", "teal", "cyan", "magenta", "indigo", "navy", "gold", "silver",
] as const;

/** Words too common to treat as a deliberate stable-id mention, even when a page/entity happens to use one as its id. */
const ID_MATCH_STOPWORDS = new Set([
  "the", "and", "for", "with", "this", "that", "you", "its", "was", "are", "not", "can", "all",
  "app", "page", "name", "text", "make", "set", "add", "new", "use", "one", "any", "has", "but",
]);

const REFERENTIAL_PATTERN = /\b(it|its|this|that|these|those|them|they|same|still|again|instead)\b/i;

const VALUE_CUE_PATTERN =
  /(?:whose|that its|that has|which has|with)\s+(?:the\s+)?(?:value|text|label|name|title|caption)\s+(?:is\s+|of\s+)?([^,.;]{1,80})/gi;
const NAMED_CUE_PATTERN = /\b(?:titled|named|called|labell?ed)\s+([^,.;]{1,80})/gi;
const REPLACE_PATTERN = /\b(?:replace|change|rename|update|set)\s+(.{1,80}?)\s+to\s+([^,.;]{1,80})/gi;
const QUOTE_PATTERN = /["'`“‘]([^"'`”’]{1,200})["'`”’]/g;

/** Determiners and property words stripped from the front of an extracted phrase, so "the title Home" also yields "Home". */
const LEADING_NOISE = /^(?:the|a|an|its|this|that|our|my)\s+/i;

function cleanPhrase(raw: string): string {
  return raw
    .replace(/^[\s"'`“‘]+|[\s"'`”’.?!]+$/g, "")
    .replace(LEADING_NOISE, "")
    .trim();
}

/**
 * Pulls the deterministic signals out of one free-text request. Every rule
 * is a bounded regex over bounded input — the request text is already capped
 * at the API layer (lib/validation/conversations.ts), and each capture group
 * has its own length ceiling, so no input can make this scan super-linear.
 *
 * The request is untrusted data throughout: nothing extracted here is ever
 * executed, interpolated into SQL, or treated as an instruction. It is only
 * ever compared, normalized, against values the server itself indexed.
 */
export function extractRequestSignals(request: string, index: SpecIndex): RequestSignals {
  const valuePhrases = new Set<string>();
  const replacementValues = new Set<string>();

  for (const match of request.matchAll(QUOTE_PATTERN)) {
    const phrase = cleanPhrase(match[1]);
    if (phrase) valuePhrases.add(phrase);
  }
  for (const match of request.matchAll(VALUE_CUE_PATTERN)) {
    addPhraseWithFallbacks(valuePhrases, match[1], index);
  }
  for (const match of request.matchAll(NAMED_CUE_PATTERN)) {
    addPhraseWithFallbacks(valuePhrases, match[1], index);
  }
  for (const match of request.matchAll(REPLACE_PATTERN)) {
    addPhraseWithFallbacks(valuePhrases, match[1], index);
    const replacement = cleanPhrase(match[2]);
    if (replacement) replacementValues.add(replacement);
  }

  // A value the user is asking us to *write* is not a value to search for.
  for (const replacement of replacementValues) {
    valuePhrases.delete(replacement);
  }

  const normalizedRequest = normalizeText(request);

  const propertyPhrases: string[] = [];
  for (const alias of collectAliases(index)) {
    if (containsPhrase(normalizedRequest, alias)) propertyPhrases.push(alias);
  }

  const stableIdMentions: string[] = [];
  for (const token of normalizedRequest.split(/[^a-z0-9_-]+/)) {
    if (token.length < 3 || ID_MATCH_STOPWORDS.has(token)) continue;
    if (index.byStableId.has(token) && !stableIdMentions.includes(token)) stableIdMentions.push(token);
  }

  const colorWords: string[] = [];
  for (const color of COLOR_WORDS) {
    if (containsPhrase(normalizedRequest, color)) colorWords.push(color);
  }
  for (const hex of request.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
    colorWords.push(hex[0].toLowerCase());
  }

  return {
    valuePhrases: [...valuePhrases],
    replacementValues: [...replacementValues],
    propertyPhrases,
    stableIdMentions,
    colorWords,
    referential: REFERENTIAL_PATTERN.test(request),
  };
}

/**
 * Adds a cue-extracted phrase, plus the variant with a leading property word
 * removed. "the title Home" yields both `title home` (no match) and `Home`
 * (the real one) without needing a separate grammar per phrasing.
 */
function addPhraseWithFallbacks(into: Set<string>, raw: string, index: SpecIndex): void {
  const phrase = cleanPhrase(raw);
  if (!phrase) return;
  into.add(phrase);

  const words = phrase.split(/\s+/);
  for (let take = 1; take < words.length && take <= 3; take += 1) {
    const head = words.slice(0, take).join(" ");
    if (!anyTargetHasAlias(index, head)) continue;
    const tail = words.slice(take).join(" ").trim();
    if (tail) into.add(tail);
  }
}

const aliasCache = new WeakMap<SpecIndex, string[]>();

function collectAliases(index: SpecIndex): string[] {
  const cached = aliasCache.get(index);
  if (cached) return cached;
  const aliases = new Set<string>();
  for (const target of index.targets) {
    aliases.add(normalizeText(target.property));
    for (const alias of target.aliases) aliases.add(normalizeText(alias));
  }
  // Longest first, so "primary color" is reported rather than only "color".
  const sorted = [...aliases].filter((a) => a.length > 0).sort((a, b) => b.length - a.length || a.localeCompare(b));
  aliasCache.set(index, sorted);
  return sorted;
}

function anyTargetHasAlias(index: SpecIndex, phrase: string): boolean {
  const normalized = normalizeText(phrase);
  return index.targets.some((target) => matchesPropertyAlias(target, normalized));
}

function containsPhrase(normalizedHaystack: string, phrase: string): boolean {
  const normalized = normalizeText(phrase);
  if (!normalized) return false;
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(normalizedHaystack);
}

// ─── Resolution ────────────────────────────────────────────────────────────

/** The already-validated preview selection, narrowed to what resolution needs. */
export interface ResolverSelection {
  pageId?: string;
  componentId?: string;
  componentKind?: string;
  label?: string;
}

export interface ResolveTargetsInput {
  request: string;
  index: SpecIndex;
  /** Validated against the current spec version upstream (lib/modification/selectionContext.ts) — a stale selection never reaches here. */
  selection: ResolverSelection | null;
  /** Already invalidated against `index` by the caller (see memory.ts#invalidateStaleFacts). */
  memory: ConversationMemoryFacts;
  /** Set when memory facts were dropped as stale — turns an empty result into an explainable one. */
  memoryWasInvalidated?: boolean;
}

export function resolveTargets(input: ResolveTargetsInput): TargetResolution {
  const signals = extractRequestSignals(input.request, input.index);
  const subjects = new Map<string, TargetCandidate>();

  const offer = (target: IndexedTarget, strategy: ResolutionStrategy, base: number, reason: string) => {
    const confidence = scoreTarget(target, base, signals);
    const existing = subjects.get(target.targetId);
    if (existing) {
      if (!existing.evidence.includes(reason)) existing.evidence.push(reason);
      if (confidence > existing.confidence) {
        existing.confidence = confidence;
        existing.strategy = strategy;
      }
      return;
    }
    subjects.set(target.targetId, { target, role: "subject", strategy, confidence, evidence: [reason] });
  };

  // 1 — current preview selection.
  if (input.selection) {
    for (const target of input.index.targets) {
      if (input.selection.componentId && target.componentId === input.selection.componentId) {
        offer(target, "selection", SELECTION_COMPONENT_CONFIDENCE, "the user selected this component in the preview");
      } else if (
        !input.selection.componentId &&
        input.selection.pageId &&
        target.pageId === input.selection.pageId
      ) {
        offer(target, "selection", SELECTION_PAGE_CONFIDENCE, "the user selected this page in the preview");
      }
    }
  }

  // 2 — a stable id named literally in the request.
  for (const id of signals.stableIdMentions) {
    for (const target of input.index.byStableId.get(id) ?? []) {
      offer(target, "stable_id", STABLE_ID_CONFIDENCE, `the request names the stable id "${id}"`);
    }
  }

  // 3/4 — exact current value (normalization already makes this
  // case-insensitive, so the contract's separate "exact label" tier is the
  // same comparison against a visible-text property; `VISIBLE_TEXT_BONUS`
  // in scoreTarget is what ranks it above a non-visible property of equal
  // strength rather than a duplicate rule doing the same work twice).
  for (const phrase of signals.valuePhrases) {
    const matches = input.index.byNormalizedValue.get(normalizeText(phrase)) ?? [];
    const base = matches.length === 1 ? EXACT_VALUE_UNIQUE_CONFIDENCE : EXACT_VALUE_SHARED_CONFIDENCE;
    for (const target of matches) {
      offer(target, "exact_value", base, `its current value is exactly "${phrase}"`);
    }
  }

  // 5 — unique case-insensitive containment, only when nothing matched exactly.
  if (subjects.size === 0) {
    for (const phrase of signals.valuePhrases) {
      const normalized = normalizeText(phrase);
      if (normalized.length < 3) continue;
      const matches = input.index.targets.filter(
        (target) => target.value !== null && normalizeText(target.value).includes(normalized),
      );
      if (matches.length !== 1) continue;
      offer(matches[0], "case_insensitive", CASE_INSENSITIVE_CONFIDENCE, `its current value contains "${phrase}"`);
    }
  }

  // 6 — recent memory. Used when the request leans on a pronoun/continuation,
  // or when it re-uses a phrase the conversation already bound to a target.
  for (const reference of input.memory.references) {
    const target = input.index.byTargetId.get(reference.targetId);
    if (!target) continue; // already-invalidated facts are filtered upstream; belt and braces.
    const phraseMentioned = containsPhrase(normalizeText(input.request), reference.phrase);
    if (!phraseMentioned && !signals.referential) continue;
    offer(
      target,
      "memory",
      MEMORY_CONFIDENCE,
      phraseMentioned
        ? `this conversation already resolved "${reference.phrase}" to it`
        : `the request refers back to the last thing this conversation resolved ("${reference.phrase}")`,
    );
  }

  // 7 — a property word with no subject at all, when exactly one target in
  // the whole specification owns that property.
  if (subjects.size === 0 && signals.propertyPhrases.length > 0) {
    for (const phrase of signals.propertyPhrases) {
      const matches = input.index.targets.filter((target) => matchesPropertyAlias(target, phrase) && !target.archived);
      if (matches.length !== 1) continue;
      offer(matches[0], "property_only", PROPERTY_ONLY_CONFIDENCE, `"${phrase}" names the only such property in this app`);
    }
  }

  const rankedSubjects = [...subjects.values()]
    .sort(byConfidenceThenId)
    .slice(0, MAX_SUBJECT_CANDIDATES);

  const capabilities = capabilityHints(input.index, signals, rankedSubjects);
  const candidates = [...rankedSubjects, ...capabilities];

  const { outcome, resolved } = decide(rankedSubjects);
  const question =
    outcome === "resolved"
      ? null
      : buildGroundedQuestion(rankedSubjects, signals, Boolean(input.memoryWasInvalidated));

  return { outcome, resolved, candidates, question, signals };
}

function scoreTarget(target: IndexedTarget, base: number, signals: RequestSignals): number {
  let score = base;

  if (signals.propertyPhrases.length > 0) {
    const matched = signals.propertyPhrases.some((phrase) => matchesPropertyAlias(target, phrase));
    score += matched ? PROPERTY_MATCH_BONUS : -PROPERTY_MISMATCH_PENALTY;
    if (matched && target.visibleText) score += VISIBLE_TEXT_BONUS;
  } else if (signals.colorWords.length > 0) {
    // A colour request names no property, but it is not property-neutral: a
    // colour is about something rendered. Without this, selecting a page and
    // saying "still black" ties the page's title against its URL path at
    // identical confidence and produces a question offering a choice nobody
    // would ever make. Same rule as a named property word, driven by the
    // colour signal instead.
    score += target.visibleText ? VISIBLE_TEXT_BONUS : -PROPERTY_MISMATCH_PENALTY;
  }
  if (target.archived) score -= ARCHIVED_PENALTY;

  return Math.max(0, Math.min(1, Number(score.toFixed(4))));
}

function byConfidenceThenId(a: TargetCandidate, b: TargetCandidate): number {
  if (b.confidence !== a.confidence) return b.confidence - a.confidence;
  return a.target.targetId.localeCompare(b.target.targetId);
}

/**
 * The properties that can express the *kind* of change asked for, when no
 * subject candidate can. Today that is exactly one case — a colour request
 * against a schema whose only colour-valued property is
 * `branding.primaryColor` (packages/appbuilder-schema/src/branding.ts has no
 * per-component colour field, and `Branding` is a fixed typed set, not a CSS
 * escape hatch). Naming that honestly here is what lets the assistant say
 * "the closest thing I can actually change is the brand colour" instead of
 * calling the request too broad. Turning that into a user-facing capability
 * notice is slice E; slice D only supplies the candidate.
 */
function capabilityHints(
  index: SpecIndex,
  signals: RequestSignals,
  subjects: readonly TargetCandidate[],
): TargetCandidate[] {
  if (signals.colorWords.length === 0) return [];

  const alreadyColorSubject = subjects.some((candidate) => isColorProperty(candidate.target));
  if (alreadyColorSubject) return [];

  return index.targets
    .filter((target) => isColorProperty(target) && !target.archived)
    .slice(0, MAX_CAPABILITY_CANDIDATES)
    .map<TargetCandidate>((target) => ({
      target,
      role: "capability",
      strategy: "capability_hint",
      confidence: CAPABILITY_HINT_CONFIDENCE,
      evidence: [
        `the request mentions the colour "${signals.colorWords[0]}", and this is the only colour-valued property this specification can express`,
      ],
    }));
}

function isColorProperty(target: IndexedTarget): boolean {
  return target.aliases.some((alias) => normalizeText(alias) === "color");
}

function decide(subjects: readonly TargetCandidate[]): { outcome: TargetResolutionOutcome; resolved: TargetCandidate | null } {
  if (subjects.length === 0) return { outcome: "unresolved", resolved: null };

  const [top, second] = subjects;
  if (top.confidence < MIN_AUTO_RESOLVE_CONFIDENCE) return { outcome: "unresolved", resolved: null };
  if (second && top.confidence - second.confidence < MIN_AUTO_RESOLVE_MARGIN) {
    return { outcome: "ambiguous", resolved: null };
  }
  return { outcome: "resolved", resolved: top };
}

/**
 * One question, naming what actually competed. "Broad" is never a reason
 * here (M13 product contract) — the question either lists the real
 * duplicates or says precisely what could no longer be located.
 */
function buildGroundedQuestion(
  subjects: readonly TargetCandidate[],
  signals: RequestSignals,
  memoryWasInvalidated: boolean,
): string {
  if (subjects.length > 1) {
    const options = subjects
      .slice(0, MAX_CANDIDATES_IN_QUESTION)
      .map((candidate) => `${candidate.target.label}`)
      .join("; ");
    const searched = signals.valuePhrases[0] ?? signals.propertyPhrases[0];
    const preamble = searched ? `More than one thing matches "${searched}"` : "More than one thing matches that";
    return `${preamble}: ${options}. Which one did you mean?`;
  }

  if (memoryWasInvalidated) {
    return "What I previously matched that phrase to has changed or no longer exists in this app, so I can't reuse it. Which page, component, or field should I change?";
  }

  if (subjects.length === 1) {
    return `I found one close match — ${subjects[0].target.label} — but not confidently enough to change it without checking. Is that the one you meant?`;
  }

  const searched = signals.valuePhrases[0];
  if (searched) {
    return `Nothing in this app currently has the value "${searched}". Which page, component, or field did you mean?`;
  }
  return "I couldn't match that to anything in this app's current specification. Which page, component, or field should I change?";
}
