"use client";

/**
 * Draft persistence for the generation clarification form.
 *
 * The questions AppBuilder asks before generating are substantial — display
 * name and hero copy, three project write-ups, contact preferences, theme
 * choices. Losing several minutes of that to a stray Back button, an
 * accidental Cmd-W, or a reload is the single worst small failure this
 * screen has, because none of it is recoverable: the answers only exist in
 * React state until Submit.
 *
 * A confirmation dialog (see useLeaveGuard.ts) is the visible half of the
 * fix. This is the half that actually saves the work — a dialog only helps
 * if the user notices it and clicks the right button, whereas a restored
 * draft helps even when they leave on purpose and change their mind.
 *
 * Why `sessionStorage` rather than the module-scoped store used by the
 * composer (workspace/attachmentDraft.ts): that store solves a different
 * problem — surviving a panel switch within one page life — and is
 * deliberately cleared by a reload because the server is authoritative for
 * attachments. Here there is no server-side copy at all until Submit, and a
 * reload is precisely the case worth surviving. `sessionStorage` is scoped
 * to the tab, so a shared machine does not leak one person's half-written
 * answers into another's session the way `localStorage` would.
 *
 * Keyed by job AND round: a second clarification round asks different
 * questions, and resuming round 2 with round 1's text would be worse than
 * an empty form.
 */

export interface ClarificationDraft {
  answers: Record<string, string>;
  savedAt: string;
}

/** Drafts older than this are ignored and cleaned up on read. */
const MAX_DRAFT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function draftKey(appId: string, jobId: string, roundNumber: number): string {
  return `appbuilder:clarification:${appId}:${jobId}:r${roundNumber}`;
}

/** True when at least one answer has real content — whitespace alone is not worth guarding or storing. */
export function hasUnsavedAnswers(answers: Record<string, string>): boolean {
  return Object.values(answers).some((value) => value.trim().length > 0);
}

/**
 * Storage can throw rather than merely fail: Safari's private mode and a
 * full quota both raise on `setItem`, and some hardened browser profiles
 * raise on merely *touching* `sessionStorage`. A draft is a convenience, so
 * every path here degrades to "no draft" instead of taking the form down
 * with it.
 */
function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function saveDraft(
  appId: string,
  jobId: string,
  roundNumber: number,
  answers: Record<string, string>
): void {
  const store = storage();
  if (!store) return;
  const key = draftKey(appId, jobId, roundNumber);
  try {
    // An emptied form clears the draft rather than persisting a row of blank
    // strings — otherwise deliberately clearing an answer would silently
    // come back on the next visit.
    if (!hasUnsavedAnswers(answers)) {
      store.removeItem(key);
      return;
    }
    const payload: ClarificationDraft = { answers, savedAt: new Date().toISOString() };
    store.setItem(key, JSON.stringify(payload));
  } catch {
    // Out of quota or storage denied — the form keeps working, unsaved.
  }
}

/**
 * Returns the stored answers, or `null` when there is nothing usable.
 * Parsed defensively: anything that is not the expected shape is discarded
 * rather than partially trusted, because this value flows straight into
 * form state.
 */
export function loadDraft(
  appId: string,
  jobId: string,
  roundNumber: number,
  now: Date = new Date()
): Record<string, string> | null {
  const store = storage();
  if (!store) return null;
  const key = draftKey(appId, jobId, roundNumber);
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const answers = parseDraft(raw, now);
    if (!answers) {
      store.removeItem(key);
      return null;
    }
    return answers;
  } catch {
    return null;
  }
}

/** Pure parse/validate half of `loadDraft`, split out so it is testable without a browser. */
export function parseDraft(raw: string, now: Date = new Date()): Record<string, string> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const { answers, savedAt } = parsed as Partial<ClarificationDraft>;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return null;

  if (typeof savedAt === "string") {
    const age = now.getTime() - new Date(savedAt).getTime();
    // A draft from last month almost certainly belongs to a question the
    // user has long since stopped thinking about.
    if (Number.isFinite(age) && age > MAX_DRAFT_AGE_MS) return null;
  }

  const clean: Record<string, string> = {};
  for (const [questionId, value] of Object.entries(answers)) {
    if (typeof value === "string") clean[questionId] = value;
  }
  return hasUnsavedAnswers(clean) ? clean : null;
}

export function clearDraft(appId: string, jobId: string, roundNumber: number): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(draftKey(appId, jobId, roundNumber));
  } catch {
    // Nothing to do — a stale draft is bounded by MAX_DRAFT_AGE_MS anyway.
  }
}
