import "server-only";
import { Prisma } from "../../db/generated";
import { getJobmatchDb } from "../../db/client";
import { logError } from "../../observability/logger";
import {
  MAX_LISTED_DRAFTS,
  REUSE_FETCH_DAYS,
  parseStoredOptions,
  type DraftUpdate,
  type TailorDraftSummary,
  type TailorDraftView,
} from "./contract";

/**
 * Database side of Tailor drafts (see ./contract.ts). Every query is scoped
 * to the workspace: a job id from another workspace reads as "not found".
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const SNIPPET_CHARS = 400;

/** Only real pasted URLs go back into the URL field; the other intake
 *  paths store pseudo-URLs (`pasted://`, `manual://`, ...). */
function visibleUrl(sourceUrl: string): string | null {
  return /^https?:\/\//i.test(sourceUrl) ? sourceUrl : null;
}

/**
 * Opens the draft for a job that just landed. Never throws: a failed
 * draft write is logged and the intake answers as before, so tailoring
 * never depends on drafts.
 *
 * `carryFrom`: the job this one replaces ("Fetch again" on the same URL).
 * Its draft's options card choices move over, and its draft is closed, so
 * one URL never shows up twice under "Unfinished jobs". A review does not
 * move: it belongs to the old job's preview.
 */
export async function openDraft(workspaceId: string, targetJobId: string, carryFrom?: string | null): Promise<void> {
  const db = getJobmatchDb();
  try {
    let options: Prisma.InputJsonValue | undefined;
    if (carryFrom && carryFrom !== targetJobId) {
      const previous = await db.tailorDraft.findFirst({
        where: { workspaceId, targetJobId: carryFrom },
        select: { id: true, options: true },
      });
      if (previous) {
        const carried = parseStoredOptions(previous.options);
        if (carried) options = carried;
        await db.tailorDraft.deleteMany({ where: { id: previous.id, workspaceId } });
      }
    }
    await db.tailorDraft.upsert({
      where: { targetJobId },
      create: { workspaceId, targetJobId, ...(options ? { options } : {}) },
      // Re-landing on a job (a reused fetch) touches it, so it is the
      // latest one; its choices stay as they were.
      update: { updatedAt: new Date() },
    });
  } catch (error) {
    logError("tailoring.draft.open_failed", error, { targetJobId });
  }
}

export type SaveDraftResult = { ok: true; updatedAt: string } | { ok: false; status: 404 | 409; error: string };

/** Saves the candidate's progress on one job's draft. */
export async function saveDraft(workspaceId: string, targetJobId: string, update: DraftUpdate): Promise<SaveDraftResult> {
  const db = getJobmatchDb();
  const job = await db.targetJob.findFirst({
    where: { id: targetJobId, workspaceId },
    select: { id: true, rawText: true },
  });
  if (!job || !job.rawText) return { ok: false, status: 404, error: "Job not found." };
  if (update.previewId) {
    // A review draft must belong to this job's own unused preview.
    const preview = await db.tailorPreview.findFirst({
      where: { id: update.previewId, workspaceId, targetJobId },
      select: { consumedAt: true },
    });
    if (!preview || preview.consumedAt) {
      return { ok: false, status: 409, error: "That review was already saved or has expired." };
    }
  }
  const data = {
    step: update.step,
    options: update.options ?? undefined,
    previewId: update.previewId,
    review: (update.review ?? undefined) as Prisma.InputJsonValue | undefined,
  };
  const row = await db.tailorDraft.upsert({
    where: { targetJobId },
    create: { workspaceId, targetJobId, ...data },
    update: {
      ...data,
      // An explicit null clears the stored review / options.
      ...(update.review === null ? { review: Prisma.DbNull } : {}),
      ...(update.options === null ? { options: Prisma.DbNull } : {}),
    },
    select: { updatedAt: true, workspaceId: true },
  });
  // targetJobId is unique, and the job was checked above: the row can only
  // belong to this workspace. Checked anyway so that stays true.
  if (row.workspaceId !== workspaceId) return { ok: false, status: 404, error: "Job not found." };
  return { ok: true, updatedAt: row.updatedAt.toISOString() };
}

/** "Discard": the draft goes, the job row stays. */
export async function discardDraft(workspaceId: string, targetJobId: string): Promise<boolean> {
  const result = await getJobmatchDb().tailorDraft.deleteMany({ where: { workspaceId, targetJobId } });
  return result.count > 0;
}

/** Saving the CV closes the job's draft. Never throws. */
export async function closeDraft(workspaceId: string, targetJobId: string): Promise<void> {
  try {
    await getJobmatchDb().tailorDraft.deleteMany({ where: { workspaceId, targetJobId } });
  } catch (error) {
    logError("tailoring.draft.close_failed", error, { targetJobId });
  }
}

/** The unfinished jobs, latest first. */
export async function listDrafts(workspaceId: string): Promise<TailorDraftSummary[]> {
  const rows = await getJobmatchDb().tailorDraft.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
    take: MAX_LISTED_DRAFTS,
    select: { targetJobId: true, step: true, updatedAt: true, targetJob: { select: { title: true, employer: true } } },
  });
  return rows.map((row) => ({
    targetJobId: row.targetJobId,
    title: row.targetJob.title,
    employer: row.targetJob.employer,
    step: row.step === "review" ? "review" : "options",
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/**
 * The draft to resume: the named job's, or else the latest. A review whose
 * preview was used or deleted resumes on the options card instead
 * (`reviewExpired`), since it could no longer be saved.
 */
export async function loadDraft(workspaceId: string, targetJobId?: string | null): Promise<TailorDraftView | null> {
  const db = getJobmatchDb();
  const row = await db.tailorDraft.findFirst({
    where: targetJobId ? { workspaceId, targetJobId } : { workspaceId },
    orderBy: { updatedAt: "desc" },
    select: {
      targetJobId: true,
      step: true,
      options: true,
      previewId: true,
      review: true,
      updatedAt: true,
      targetJob: { select: { sourceUrl: true, title: true, employer: true, rawText: true, fetchedAt: true } },
    },
  });
  if (!row || !row.targetJob.rawText) return null;

  let step: TailorDraftView["step"] = row.step === "review" ? "review" : "options";
  let review = isRecord(row.review) ? row.review : null;
  let reviewExpired = false;
  if (step === "review") {
    const preview = row.previewId
      ? await db.tailorPreview.findFirst({
          where: { id: row.previewId, workspaceId, targetJobId: row.targetJobId },
          select: { consumedAt: true },
        })
      : null;
    if (!preview || preview.consumedAt || !review) {
      step = "options";
      review = null;
      reviewExpired = true;
    }
  }

  return {
    targetJobId: row.targetJobId,
    sourceUrl: visibleUrl(row.targetJob.sourceUrl),
    title: row.targetJob.title,
    employer: row.targetJob.employer,
    snippet: row.targetJob.rawText.slice(0, SNIPPET_CHARS),
    fetchedAt: row.targetJob.fetchedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    step,
    options: parseStoredOptions(row.options),
    previewId: step === "review" ? row.previewId : null,
    review: step === "review" ? review : null,
    reviewExpired,
  };
}

/**
 * A job this workspace already fetched from exactly this URL within
 * REUSE_FETCH_DAYS, with readable text: pasting the URL again lands on it
 * instead of fetching (and paying for) the page again.
 */
export async function findRecentFetch(workspaceId: string, sourceUrl: string, now: Date = new Date()) {
  return getJobmatchDb().targetJob.findFirst({
    where: {
      workspaceId,
      sourceUrl,
      status: "FETCHED",
      rawText: { not: null },
      fetchedAt: { gte: new Date(now.getTime() - REUSE_FETCH_DAYS * DAY_MS) },
    },
    orderBy: { fetchedAt: "desc" },
    select: {
      id: true,
      status: true,
      title: true,
      employer: true,
      rawText: true,
      fetchedAt: true,
      fetchLooksIncomplete: true,
      fetchQualityReasons: true,
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
