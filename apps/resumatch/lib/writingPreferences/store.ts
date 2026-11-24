import { getJobmatchDb } from "../db/client";
import { recordAuditEvent } from "../workspace";
import {
  isEmptyWritingPreferences,
  readWritingPreferences,
  sameWritingPreferences,
  type WritingPreferences,
  type WritingPreferencesView,
} from "./contract";

/**
 * Database side of saved writing preferences (#931). Every query is scoped
 * to the workspace. Revisions are immutable: a save adds one, a reset adds
 * an empty one, and delete removes them all.
 *
 * Saves are optimistic: the client names the revision it started from
 * (`baseRevisionId`, null when it saw none). If another tab saved in the
 * meantime, the save is refused as stale and the caller gets the current
 * revision back, so nothing silently overwrites a newer choice. The unique
 * (workspaceId, revisionNumber) index backs this up when two saves race.
 */

type Row = { id: string; revisionNumber: number; content: unknown; createdAt: Date };
type Db = ReturnType<typeof getJobmatchDb>;
type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];
type Client = Db | Tx;

function toView(row: Row): WritingPreferencesView {
  return {
    revisionId: row.id,
    revisionNumber: row.revisionNumber,
    savedAt: row.createdAt.toISOString(),
    preferences: readWritingPreferences(row.content),
  };
}

async function latestRow(workspaceId: string, client: Client = getJobmatchDb()): Promise<Row | null> {
  return client.writingPreferenceRevision.findFirst({
    where: { workspaceId },
    orderBy: { revisionNumber: "desc" },
    select: { id: true, revisionNumber: true, content: true, createdAt: true },
  });
}

/** The current saved preferences, or null when there are none. */
export async function getWritingPreferences(workspaceId: string): Promise<WritingPreferencesView | null> {
  const row = await latestRow(workspaceId);
  return row ? toView(row) : null;
}

export type SaveWritingPreferencesResult =
  | { ok: true; current: WritingPreferencesView | null; changed: boolean }
  | { ok: false; reason: "stale"; current: WritingPreferencesView | null };

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

/**
 * Saves `prefs` as a new revision on top of `baseRevisionId`. Saving the
 * same values as the current revision writes nothing (no empty history).
 * Empty preferences are a reset: a revision that sets nothing.
 */
export async function saveWritingPreferences(
  workspaceId: string,
  prefs: WritingPreferences,
  baseRevisionId: string | null,
  /** A transaction to write in (#932 promotions); defaults to the client. */
  client: Client = getJobmatchDb(),
): Promise<SaveWritingPreferencesResult> {
  const latest = await latestRow(workspaceId, client);
  if ((latest?.id ?? null) !== baseRevisionId) {
    return { ok: false, reason: "stale", current: latest ? toView(latest) : null };
  }
  if (latest && sameWritingPreferences(readWritingPreferences(latest.content), prefs)) {
    return { ok: true, current: toView(latest), changed: false };
  }
  if (!latest && isEmptyWritingPreferences(prefs)) {
    // Nothing saved and nothing to save: no revision, nothing to reset.
    return { ok: true, current: null, changed: false };
  }
  let created: Row;
  try {
    created = await client.writingPreferenceRevision.create({
      data: { workspaceId, revisionNumber: (latest?.revisionNumber ?? 0) + 1, content: prefs as unknown as object },
      select: { id: true, revisionNumber: true, content: true, createdAt: true },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // Inside a transaction the failed insert aborted it: let the caller see
    // the error rather than query an aborted transaction.
    if (client !== getJobmatchDb()) throw error;
    const current = await latestRow(workspaceId);
    return { ok: false, reason: "stale", current: current ? toView(current) : null };
  }
  const reset = isEmptyWritingPreferences(prefs);
  // Counts and closed choices only: style notes are the candidate's text.
  await recordAuditEvent(workspaceId, reset ? "writing_preferences.reset" : "writing_preferences.saved", {
    revision: created.revisionNumber,
    cvLanguage: prefs.cv.outputLanguage,
    letterTone: prefs.coverLetter.tone,
    letterLength: prefs.coverLetter.length,
    letterLanguage: prefs.coverLetter.outputLanguage,
    styleNotes: [prefs.cv.styleNote, prefs.coverLetter.styleNote].filter(Boolean).length,
  });
  return { ok: true, current: toView(created), changed: true };
}

/** Deletes every revision. Existing previews and CVs keep their own
 *  snapshot of what they used; nothing else points at a revision. */
export async function deleteWritingPreferences(workspaceId: string): Promise<number> {
  const { count } = await getJobmatchDb().writingPreferenceRevision.deleteMany({ where: { workspaceId } });
  if (count > 0) await recordAuditEvent(workspaceId, "writing_preferences.deleted", { revisions: count });
  return count;
}
