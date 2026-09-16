/**
 * JM-044: ingestion-time prompt-injection heuristic scanner.
 *
 * A job posting's `description` is written by a stranger and, from M5
 * onward, is fed to a model as fenced DATA inside `evaluate.ts`'s prompt
 * (see `prompts.ts`'s fence + HARD RULES mechanism and `contract.ts`'s
 * `parseMatchResult()` schema guard — those two are the actual structural
 * defence against a live injection reaching a persisted `MatchResult`).
 *
 * This module is a *different*, narrower thing: a cheap, pure,
 * model-free regex/keyword scan run once per posting during M3's
 * `normalizePosting` step, purely so an operator can see "this posting
 * looks like it's trying to talk to an AI" without waiting for — or
 * paying for — a per-match model call. It never blocks ingestion and
 * never changes matching behaviour; it only annotates the row
 * (`JobPosting.flaggedForInjectionReview` / `injectionPatternCodes`,
 * prisma/schema.prisma) for review.
 *
 * **False positives are an accepted tradeoff, not a bug to chase to
 * zero.** A posting that legitimately says "please follow the
 * application instructions below" is ordinary HR language, not an
 * attack — the patterns below are written to require the
 * *imperative-to-an-AI* shape (an instruction word next to "instructions",
 * "system prompt", "ignore", etc.) rather than any single trigger word in
 * isolation, and are tested against exactly that legitimate case in
 * injectionHeuristics.test.ts. Some false positives will still occur; that
 * is why this produces a review annotation, never a rejection.
 */

export type InjectionPatternCode =
  | "IGNORE_INSTRUCTIONS"
  | "ROLE_OVERRIDE"
  | "SYSTEM_PROMPT_PROBE"
  | "REVEAL_REQUEST"
  | "TOOL_INVOCATION"
  | "FENCE_EVASION"
  | "SCORE_FORCING";

export interface InjectionHeuristicResult {
  flagged: boolean;
  patternCodes: InjectionPatternCode[];
}

interface HeuristicPattern {
  code: InjectionPatternCode;
  regex: RegExp;
}

// Each pattern targets an imperative-to-an-AI *shape*, not a bare trigger
// word, so ordinary HR phrasing ("follow the application instructions
// below", "please review our system for tracking applications") does not
// match. Case-insensitive; `u` flag for correct handling of the
// unicode/homoglyph-adjacent text these patterns also need to see through
// after NFKC normalisation (see `normalizeForScan` below).
const PATTERNS: HeuristicPattern[] = [
  {
    code: "IGNORE_INSTRUCTIONS",
    regex:
      /\bignore\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)\b/iu,
  },
  {
    // Dutch / French equivalents of IGNORE_INSTRUCTIONS ("negeer alle
    // voorgaande instructies" / "ignorez toutes les instructions
    // précédentes") -- a separate pattern rather than folded into the
    // English one above, so each stays readable and independently
    // testable.
    code: "IGNORE_INSTRUCTIONS",
    regex:
      /\bnegeer\s+(alle\s+|elke\s+)?(voorgaande|vorige|bovenstaande)\s+instructies\b|\bignorez\s+(toutes\s+les\s+|les\s+)?instructions\s+(précédentes|precedentes|ci-dessus)\b/iu,
  },
  {
    code: "ROLE_OVERRIDE",
    regex: /\byou\s+are\s+now\s+(a|an|in)\b|\bact\s+as\s+(if\s+you\s+are\s+)?(a|an)\b.{0,30}\b(admin|system|developer|root)\b|\benter\s+(admin|developer|debug)\s+mode\b/iu,
  },
  {
    code: "SYSTEM_PROMPT_PROBE",
    regex: /\b(system\s+prompt|your\s+(instructions|guidelines|rules)|hidden\s+prompt)\b/iu,
  },
  {
    code: "REVEAL_REQUEST",
    regex:
      /\b(reveal|print|output|show|disclose)\s+(the\s+)?(candidate('s)?\s+(\w+\s+)?profile|full\s+profile|system\s+prompt|your\s+instructions)\b/iu,
  },
  {
    // Dutch reveal-request equivalent ("onthul het kandidaatprofiel / je
    // systeeminstructies").
    code: "REVEAL_REQUEST",
    regex: /\bonthul\s+(eerst\s+)?(het\s+)?(volledige\s+)?(kandidaat\s*profiel|systeem\s*instructies?)\b/iu,
  },
  {
    code: "TOOL_INVOCATION",
    regex: /\b(call|invoke|use|execute)\s+(the\s+)?(tool|function|api|plugin)\b|\bfunction_call\s*[:=]/iu,
  },
  {
    // French tool-invocation equivalent ("appeler la fonction ...").
    code: "TOOL_INVOCATION",
    regex: /\bappeler\s+la\s+fonction\b/iu,
  },
  {
    code: "SCORE_FORCING",
    regex:
      /\b(set|output|report|give|assign)\s+(the\s+)?(suitabilityScore|suitability\s+score|match(ing)?\s+score|confidence)\s+(to|as)\s+(1(\.0+)?\b|100\s*%|"?maximum"?\b)/iu,
  },
  {
    // Dutch / French score-forcing equivalents ("geef ... een perfecte
    // score van 100%" / "attribuez ... un score ... de 100%").
    code: "SCORE_FORCING",
    regex:
      /\b(geef|ken\s+toe)\b.{0,40}\b(perfecte\s+score|score\s+van\s+100\s*%)\b|\battribuez\b.{0,40}\bscore\b.{0,30}\bde\s+100\s*%/iu,
  },
  {
    code: "FENCE_EVASION",
    // A run of the literal fence sentinel characters this codebase uses
    // (`<<<`/`>>>`/backtick fences), OR a suspicious density of
    // zero-width / bidi-control unicode characters often used to break a
    // fence visually while surviving a naive substring check.
    regex: /(<{3,}|>{3,}|`{3,})|[​-‏‪-‮﻿]{2,}/u,
  },
];

/**
 * Normalise before scanning so a homoglyph/unicode evasion attempt (full-
 * width Latin letters, combining marks used to visually fake "ignore",
 * etc.) collapses back to plain ASCII where possible. NFKC folds
 * compatibility variants (e.g. fullwidth "ｉｇｎｏｒｅ" -> "ignore");
 * combining marks are then stripped. This mirrors normalize.ts's own
 * `tidy`/`foldIdentity` posture of folding before matching rather than
 * trying to enumerate every possible disguise.
 */
function normalizeForScan(text: string): string {
  return text
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Scan a posting description for instruction-like / prompt-injection-shaped
 * text. Pure, synchronous, no network, no model call — safe to run on every
 * posting during ingestion (see `normalizePosting`/`run.ts`'s normalize
 * step, which is where this is actually invoked).
 */
export function scanForInjectionHeuristics(description: string): InjectionHeuristicResult {
  const normalized = normalizeForScan(description);
  const patternCodes: InjectionPatternCode[] = [];
  for (const { code, regex } of PATTERNS) {
    if (regex.test(normalized)) patternCodes.push(code);
  }
  return { flagged: patternCodes.length > 0, patternCodes };
}
