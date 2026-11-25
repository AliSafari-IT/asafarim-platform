import type { ClaimIssue, ClaimIssueReason } from "./selection/claims";
import type { ConfirmedClaim } from "./candidateEdits";

/**
 * The Tailor review's claim flow (#964), as pure functions the page and
 * its tests share. The claim check (selection/claims.ts) says which exact
 * words could not be traced to the profile and why; this module tracks
 * what the candidate did about each one and what the save will do with
 * the ones left open.
 *
 * Rules:
 * - **Support, not truth.** An open issue means "we couldn't find support
 *   in your profile", never "this is false".
 * - **Confirmed is not backed.** A claim the candidate confirms is kept
 *   with their detail as `confirmedClaims` on this CV only. It is never
 *   written to the profile; updating the profile is a separate choice.
 * - **Recheck before resolved.** Editing a flagged text does not resolve
 *   its issues: the page checks the new text again and keeps whatever is
 *   still untraced open.
 * - **Open AI text is left out on save.** An unticked bullet stays off the
 *   CV. An open issue in the AI's own headline or summary is removed when
 *   the rest still reads (`removalFor`), else its sentence, else the field
 *   falls back to the profile's own text. Text the candidate typed is kept
 *   as written, and the page lists it before saving.
 */

export type IssueStatus = "open" | "confirmed" | "excluded";

export interface ReviewIssue extends ClaimIssue {
  status: IssueStatus;
  /** The candidate's own detail when they confirmed it. */
  detail?: string | null;
}

/** One checked text on the review: the headline, the summary or one AI
 *  bullet. Spans are offsets into `checkedText`. */
export interface FieldIssues {
  field: "headline" | "summary" | "bullet";
  experienceIndex: number | null;
  /** The text the AI wrote, so an edit can be told apart. */
  aiText: string;
  /** The text `issues` were computed for. */
  checkedText: string;
  issues: ReviewIssue[];
}

/** Keyed by "headline", "summary" or a bullet's review key. */
export type ClaimReviewState = Record<string, FieldIssues>;

/** A job requirement the profile does not back: a gap to discuss, never
 *  something added to the CV on its own (#964). */
export interface RequirementGap {
  requirementId: string;
  text: string;
  priority: string;
  /** "unknown": not in the profile; "unmet"/"conflict": said no / unclear. */
  status: string;
  decision: "open" | "added" | "left_out";
}

export function openIssues(field: FieldIssues | undefined): ReviewIssue[] {
  if (!field) return [];
  return field.issues.filter((issue) => issue.status === "open");
}

/** Whether `field.issues` still describe the text on screen. */
export function isCurrent(field: FieldIssues, text: string): boolean {
  return field.checkedText === text;
}

export function openCount(state: ClaimReviewState | undefined): number {
  if (!state) return 0;
  return Object.values(state).reduce((n, field) => n + openIssues(field).length, 0);
}

export function openGapCount(gaps: RequirementGap[] | undefined): number {
  return (gaps ?? []).filter((gap) => gap.decision === "open").length;
}

export function fieldIssuesFrom(
  field: FieldIssues["field"],
  experienceIndex: number | null,
  text: string,
  issues: ClaimIssue[],
  confirmed: (issue: ClaimIssue) => ConfirmedClaim | undefined = () => undefined,
): FieldIssues {
  return {
    field,
    experienceIndex,
    aiText: text,
    checkedText: text,
    issues: issues.map((issue) => {
      const match = confirmed(issue);
      return match ? { ...issue, status: "confirmed", detail: match.detail } : { ...issue, status: "open" };
    }),
  };
}

/**
 * The issues of a recheck, for `text`. A confirmed issue on the same words
 * for the same reason stays confirmed (the candidate already said it is
 * true); everything else the recheck found is open; whatever it no longer
 * finds is gone.
 */
export function applyRecheck(field: FieldIssues, text: string, issues: ClaimIssue[]): FieldIssues {
  const confirmed = field.issues.filter((issue) => issue.status !== "open");
  return {
    ...field,
    checkedText: text,
    issues: issues.map((issue) => {
      const kept = confirmed.find((c) => c.reason === issue.reason && c.text === issue.text);
      return kept ? { ...issue, status: kept.status, detail: kept.detail } : { ...issue, status: "open" };
    }),
  };
}

export function setIssueStatus(field: FieldIssues, issueId: string, status: IssueStatus, detail?: string | null): FieldIssues {
  return {
    ...field,
    issues: field.issues.map((issue) =>
      issue.id === issueId ? { ...issue, status, detail: status === "confirmed" ? (detail?.trim() || null) : null } : issue,
    ),
  };
}

/** Every issue of a field to one status: ticking a flagged bullet
 *  confirms it, unticking excludes it. */
export function setAllStatus(field: FieldIssues, from: IssueStatus[], status: IssueStatus): FieldIssues {
  return {
    ...field,
    issues: field.issues.map((issue) => (from.includes(issue.status) ? { ...issue, status, detail: status === "confirmed" ? issue.detail ?? null : null } : issue)),
  };
}

// ---------------------------------------------------------------- removal

export interface Removal {
  text: string;
  /** "phrase": just the words (and their joiner); "segment": a headline
   *  piece; "sentence": the sentence that holds them. */
  kind: "phrase" | "segment" | "sentence";
}

const JOINER_BEFORE = /(?:,\s*|\s+(?:and|or|&|en|of|et|ou|und|oder)\s+)$/i;
const JOINER_AFTER = /^(?:\s*,\s*|\s+(?:and|or|&|en|of|et|ou|und|oder)\s+)/i;
const TRAILING_PREPOSITION = /\s+(?:using|with|via|in|on|for|at|including|through|across|to|met|voor|bij|avec|pour|chez|mit|für|bei)\s+(?:[\p{L}\p{N}+#.-]+\s+){0,2}$/iu;
const CLAUSE_END = /^\s*(?:[.;,!?)]|$)/;
const HEADLINE_SEPARATOR = /\s+[·|•—–]\s+|\s+-\s+/g;

function words(text: string): number {
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).length;
}

function tidy(text: string): string {
  let out = text
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?)])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/,\s*([.;!?])/g, "$1")
    .replace(/^[\s,;:]+/, "")
    .trim();
  if (out && /^\p{Ll}/u.test(out) && /^\p{Lu}/u.test(text.trim())) out = out[0]!.toUpperCase() + out.slice(1);
  return out;
}

/** Widen a span to whole words, so "Play" never leaves "wright". */
function wordBounds(text: string, start: number, end: number): [number, number] {
  let s = start;
  let e = end;
  while (s > 0 && /[\p{L}\p{N}+#]/u.test(text[s - 1]!)) s -= 1;
  while (e < text.length && /[\p{L}\p{N}+#]/u.test(text[e]!)) e += 1;
  return [s, e];
}

function sentenceAround(text: string, start: number): [number, number] | null {
  const sentences = [...text.matchAll(/[^.!?]+(?:[.!?]+|$)/g)].filter((m) => m[0].trim());
  if (sentences.length < 2) return null;
  for (const m of sentences) {
    const s = m.index ?? 0;
    const e = s + m[0].length;
    if (start >= s && start < e) return [s, e];
  }
  return null;
}

/**
 * What the text would read like without the issue's words, when that is
 * safe: a list item with its joiner, a trailing "using X" phrase, a
 * bracketed aside, a headline segment, or the whole sentence when the text
 * has more than one. Null when nothing can go without breaking the text
 * (one-sentence bullets are excluded instead).
 */
export function removalFor(text: string, issue: Pick<ClaimIssue, "start" | "end" | "text" | "whole">, field: FieldIssues["field"]): Removal | null {
  // A whole-claim issue has nothing to cut; stale offsets are not trusted.
  if (issue.whole || text.slice(issue.start, issue.end) !== issue.text) return null;
  const [start, end] = wordBounds(text, issue.start, issue.end);
  const minWords = field === "headline" ? 1 : 3;
  const ok = (candidate: string) => words(candidate) >= minWords && candidate !== text.trim();

  if (field === "headline") {
    const parts: { s: number; e: number }[] = [];
    let last = 0;
    for (const m of text.matchAll(HEADLINE_SEPARATOR)) {
      parts.push({ s: last, e: m.index ?? 0 });
      last = (m.index ?? 0) + m[0].length;
    }
    parts.push({ s: last, e: text.length });
    if (parts.length > 1) {
      const index = parts.findIndex((p) => start >= p.s && end <= p.e);
      if (index >= 0) {
        const part = parts[index]!;
        const cut = index === 0 ? text.slice(parts[1]!.s) : text.slice(0, parts[index - 1]!.e) + text.slice(part.e);
        const out = tidy(cut);
        if (ok(out)) return { text: out, kind: "segment" };
      }
    }
  }

  const before = text.slice(0, start);
  const after = text.slice(end);

  // "(Playwright)": the aside goes, brackets and all.
  const open = before.match(/\(\s*$/);
  const close = after.match(/^\s*\)/);
  if (open && close) {
    const out = tidy(before.slice(0, open.index) + after.slice(close[0].length));
    if (ok(out)) return { text: out, kind: "phrase" };
  }

  // A list item: "A, B and C".
  const joinBefore = before.match(JOINER_BEFORE);
  const joinAfter = after.match(JOINER_AFTER);
  if (joinBefore && joinAfter && joinBefore[0].trim() === ",") {
    // "React, Vue and Node.js": the comma before goes, the "and" stays.
    const out = tidy(before.slice(0, joinBefore.index) + after);
    if (ok(out)) return { text: out, kind: "phrase" };
  }
  if (joinAfter && (joinBefore || /(?:^|\s)$/.test(before))) {
    const out = tidy(before + after.slice(joinAfter[0].length));
    if (ok(out)) return { text: out, kind: "phrase" };
  }
  if (joinBefore && CLAUSE_END.test(after)) {
    const out = tidy(before.slice(0, joinBefore.index) + after);
    if (ok(out)) return { text: out, kind: "phrase" };
  }

  // A trailing "using Playwright" / "for Visa".
  const prep = before.match(TRAILING_PREPOSITION);
  if (prep && CLAUSE_END.test(after)) {
    const out = tidy(before.slice(0, prep.index) + after);
    if (ok(out)) return { text: out, kind: "phrase" };
  }

  const sentence = sentenceAround(text, start);
  if (sentence) {
    const out = tidy(text.slice(0, sentence[0]) + " " + text.slice(sentence[1]));
    if (words(out) >= 1) return { text: out, kind: "sentence" };
  }
  return null;
}

/**
 * The AI's headline or summary with its open issues left out, for the
 * save: each removed when it can be, last first so earlier offsets hold.
 * `fallback` when something could not be removed: the field then uses the
 * profile's own text instead.
 */
export function withoutOpenIssues(field: FieldIssues, text: string): { text: string; fallback: boolean } {
  const open = openIssues(field).sort((a, b) => b.start - a.start);
  if (open.length === 0 || !isCurrent(field, text)) return { text, fallback: false };
  let current = text;
  for (const issue of open) {
    const at = current.slice(issue.start, issue.end) === issue.text ? issue.start : current.lastIndexOf(issue.text);
    if (at < 0) continue; // already gone with an earlier sentence
    const removal = removalFor(current, { ...issue, start: at, end: at + issue.text.length }, field.field);
    if (!removal) return { text, fallback: true };
    current = removal.text;
  }
  return { text: current, fallback: false };
}

/** Whether the candidate changed the AI's text (their words are theirs). */
export function isEdited(field: FieldIssues, text: string): boolean {
  return text.trim() !== field.aiText.trim();
}

// ----------------------------------------------------------- confirmation

export interface RoleRef {
  title: string;
  employer: string | null;
  startedOn: string | null;
}

/** The confirmed claims a review holds, for `candidateEdits`. */
export function confirmedClaimsOf(
  state: ClaimReviewState | undefined,
  roleOf: (experienceIndex: number) => RoleRef | undefined,
  textOf: (key: string) => string | undefined,
): ConfirmedClaim[] {
  if (!state) return [];
  const out: ConfirmedClaim[] = [];
  for (const [key, field] of Object.entries(state)) {
    // Only claims still in the text that will be saved.
    const text = textOf(key);
    if (text === undefined) continue;
    const role = field.field === "bullet" && field.experienceIndex !== null ? roleOf(field.experienceIndex) : undefined;
    for (const issue of field.issues) {
      if (issue.status !== "confirmed" || !text.includes(issue.text)) continue;
      out.push({
        where: field.field,
        title: role?.title ?? null,
        employer: role?.employer ?? null,
        startedOn: role?.startedOn ?? null,
        claim: issue.text.slice(0, 2000),
        reason: issue.reason,
        detail: issue.detail?.trim() ? issue.detail.trim().slice(0, 500) : null,
      });
    }
  }
  return out.slice(0, 40);
}

/** The saved confirmation for an issue, for a regenerated review. */
export function savedConfirmation(
  saved: ConfirmedClaim[],
  where: FieldIssues["field"],
  role: RoleRef | undefined,
  issue: Pick<ClaimIssue, "reason" | "text">,
): ConfirmedClaim | undefined {
  const same = (a: string | null, b: string | null | undefined) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
  return saved.find(
    (c) =>
      c.where === where &&
      c.reason === issue.reason &&
      c.claim === issue.text &&
      (where !== "bullet" || (same(c.title, role?.title) && same(c.employer, role?.employer) && same(c.startedOn, role?.startedOn))),
  );
}

/** The question "Confirm with details" asks, by reason. */
export function confirmQuestionKey(reason: ClaimIssueReason): string {
  switch (reason) {
    case "name_not_in_role":
    case "requirement_not_in_role":
      return "resumatch.claimReview.ask.usedInRole";
    case "number_not_found":
      return "resumatch.claimReview.ask.number";
    case "requirement_not_found":
    case "requirement_unmet":
      return "resumatch.claimReview.ask.requirement";
    case "no_role_source":
    case "other_role":
      return "resumatch.claimReview.ask.didInRole";
    default:
      return "resumatch.claimReview.ask.true";
  }
}
