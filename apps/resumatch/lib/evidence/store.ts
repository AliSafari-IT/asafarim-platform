import { getJobmatchDb } from "../db/client";
import type { CandidateProfileContent } from "../profile/contract";
import { recordAuditEvent } from "../workspace";
import { MAX_EVIDENCE_ITEMS, readExperienceRef, type EvidenceInput, type EvidenceKind, type EvidenceScope, type ExperienceRef } from "./contract";
import { evidenceExclusion, selectGenerationEvidence, type EvidenceExclusion, type GenerationEvidence, type StoredEvidence } from "./prompt";

/**
 * Database side of background evidence (#929). Every query is scoped to the
 * workspace, so an id from another candidate reads as missing. Revisions
 * are immutable: an edit adds one, a confirm flips the latest one from
 * DRAFT to CONFIRMED, and nothing else ever changes a revision.
 */

export interface EvidenceView {
  id: string;
  scope: EvidenceScope;
  targetJobId: string | null;
  revisionId: string;
  revisionNumber: number;
  kind: EvidenceKind;
  title: string;
  detail: string;
  experienceRef: ExperienceRef | null;
  status: "DRAFT" | "CONFIRMED";
  updatedAt: string;
  /** Why the next run for this job would leave it out, or null if it is used. */
  excludedBecause: EvidenceExclusion | null;
}

const latestRevision = { orderBy: { revisionNumber: "desc" as const }, take: 1 };

type Row = {
  id: string;
  workspaceId: string;
  scope: EvidenceScope;
  targetJobId: string | null;
  createdAt: Date;
  updatedAt: Date;
  revisions: {
    id: string;
    revisionNumber: number;
    kind: EvidenceKind;
    title: string;
    detail: string;
    experienceRef: unknown;
    status: "DRAFT" | "CONFIRMED";
  }[];
};

function toStored(row: Row): StoredEvidence {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    scope: row.scope,
    targetJobId: row.targetJobId,
    createdAt: row.createdAt,
    latest: row.revisions[0] ?? null,
  };
}

/** The items that apply to one job: its own plus background. */
async function loadForJob(workspaceId: string, targetJobId: string | null): Promise<Row[]> {
  return (await getJobmatchDb().candidateEvidence.findMany({
    where: {
      workspaceId,
      OR: [{ scope: "BACKGROUND" }, ...(targetJobId ? [{ scope: "APPLICATION" as const, targetJobId }] : [])],
    },
    include: { revisions: latestRevision },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })) as Row[];
}

function toView(row: Row, workspaceId: string, targetJobId: string | null, profile: CandidateProfileContent | null): EvidenceView | null {
  const latest = row.revisions[0];
  if (!latest) return null;
  const stored = toStored(row);
  let excludedBecause: EvidenceExclusion | null = null;
  if (profile && targetJobId) excludedBecause = evidenceExclusion(stored, workspaceId, targetJobId, profile);
  else if (latest.status !== "CONFIRMED") excludedBecause = "draft";
  return {
    id: row.id,
    scope: row.scope,
    targetJobId: row.targetJobId,
    revisionId: latest.id,
    revisionNumber: latest.revisionNumber,
    kind: latest.kind,
    title: latest.title,
    detail: latest.detail,
    experienceRef: readExperienceRef(latest.experienceRef),
    status: latest.status,
    updatedAt: row.updatedAt.toISOString(),
    excludedBecause,
  };
}

export async function listEvidence(
  workspaceId: string,
  targetJobId: string | null,
  profile: CandidateProfileContent | null,
): Promise<EvidenceView[]> {
  const rows = await loadForJob(workspaceId, targetJobId);
  return rows.map((row) => toView(row, workspaceId, targetJobId, profile)).filter((v): v is EvidenceView => v !== null);
}

/** The confirmed evidence a run for this job may use, within the budgets. */
export async function loadGenerationEvidence(
  workspaceId: string,
  targetJobId: string,
  profile: CandidateProfileContent,
): Promise<GenerationEvidence> {
  const rows = await loadForJob(workspaceId, targetJobId);
  return selectGenerationEvidence(rows.map(toStored), workspaceId, targetJobId, profile);
}

export type EvidenceWriteError = "not_found" | "job_not_found" | "stale" | "too_many";

export type EvidenceWriteResult = { ok: true; id: string; revisionId: string } | { ok: false; error: EvidenceWriteError };

async function jobBelongs(workspaceId: string, targetJobId: string): Promise<boolean> {
  const job = await getJobmatchDb().targetJob.findFirst({ where: { id: targetJobId, workspaceId }, select: { id: true } });
  return job !== null;
}

function revisionData(input: EvidenceInput, confirm: boolean) {
  return {
    kind: input.kind,
    title: input.title,
    detail: input.detail,
    experienceRef: (input.experienceRef ?? undefined) as never,
    status: confirm ? ("CONFIRMED" as const) : ("DRAFT" as const),
    confirmedAt: confirm ? new Date() : null,
  };
}

export async function createEvidence(
  workspaceId: string,
  input: EvidenceInput,
  options: { scope: EvidenceScope; targetJobId: string | null; confirm: boolean },
): Promise<EvidenceWriteResult> {
  const db = getJobmatchDb();
  const targetJobId = options.scope === "APPLICATION" ? options.targetJobId : null;
  if (options.scope === "APPLICATION" && (!targetJobId || !(await jobBelongs(workspaceId, targetJobId)))) {
    return { ok: false, error: "job_not_found" };
  }
  if ((await db.candidateEvidence.count({ where: { workspaceId } })) >= MAX_EVIDENCE_ITEMS) {
    return { ok: false, error: "too_many" };
  }
  const created = await db.candidateEvidence.create({
    data: {
      workspaceId,
      scope: options.scope,
      targetJobId,
      revisions: { create: { workspaceId, revisionNumber: 1, ...revisionData(input, options.confirm) } },
    },
    include: { revisions: latestRevision },
  });
  await recordAuditEvent(workspaceId, "evidence.created", { kind: input.kind, scope: options.scope, confirmed: options.confirm });
  return { ok: true, id: created.id, revisionId: created.revisions[0]!.id };
}

function sameContent(a: EvidenceInput, b: Row["revisions"][number]): boolean {
  const ref = readExperienceRef(b.experienceRef);
  return (
    a.kind === b.kind &&
    a.title === b.title &&
    a.detail === b.detail &&
    JSON.stringify(a.experienceRef ?? null) === JSON.stringify(ref ?? null)
  );
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

/**
 * Saves an edit made on top of `baseRevisionId`. Refused as `stale` when
 * the item changed since (another tab saved first), so nothing is
 * overwritten unseen. Changed content adds a revision; unchanged content
 * with `confirm` confirms the current one; a scope change moves the item.
 */
export async function reviseEvidence(
  workspaceId: string,
  id: string,
  baseRevisionId: string,
  input: EvidenceInput,
  options: { scope: EvidenceScope; targetJobId: string | null; confirm: boolean },
): Promise<EvidenceWriteResult> {
  const db = getJobmatchDb();
  const row = (await db.candidateEvidence.findFirst({
    where: { id, workspaceId },
    include: { revisions: latestRevision },
  })) as Row | null;
  const latest = row?.revisions[0];
  if (!row || !latest) return { ok: false, error: "not_found" };
  if (latest.id !== baseRevisionId) return { ok: false, error: "stale" };

  const targetJobId = options.scope === "APPLICATION" ? (options.targetJobId ?? row.targetJobId) : null;
  if (options.scope === "APPLICATION" && (!targetJobId || !(await jobBelongs(workspaceId, targetJobId)))) {
    return { ok: false, error: "job_not_found" };
  }

  try {
    const revisionId = await db.$transaction(async (tx) => {
      let current = latest.id;
      if (!sameContent(input, latest)) {
        const created = await tx.candidateEvidenceRevision.create({
          data: { evidenceId: id, workspaceId, revisionNumber: latest.revisionNumber + 1, ...revisionData(input, options.confirm) },
          select: { id: true },
        });
        current = created.id;
      } else if (options.confirm && latest.status === "DRAFT") {
        const flipped = await tx.candidateEvidenceRevision.updateMany({
          where: { id: latest.id, workspaceId, status: "DRAFT" },
          data: { status: "CONFIRMED", confirmedAt: new Date() },
        });
        if (flipped.count === 0) throw new StaleEvidence();
      }
      // Touch the item even for a scope-only change, so updatedAt moves.
      await tx.candidateEvidence.update({ where: { id }, data: { scope: options.scope, targetJobId } });
      return current;
    });
    await recordAuditEvent(workspaceId, "evidence.revised", { kind: input.kind, scope: options.scope, confirmed: options.confirm });
    return { ok: true, id, revisionId };
  } catch (error) {
    // Two saves on the same base: the second one's revision number is taken.
    if (error instanceof StaleEvidence || isUniqueViolation(error)) return { ok: false, error: "stale" };
    throw error;
  }
}

class StaleEvidence extends Error {}

/** Confirms the item's latest revision. Idempotent; `stale` when the
 *  revision shown is no longer the latest. */
export async function confirmEvidence(workspaceId: string, id: string, revisionId: string): Promise<EvidenceWriteResult> {
  const db = getJobmatchDb();
  const row = (await db.candidateEvidence.findFirst({
    where: { id, workspaceId },
    include: { revisions: latestRevision },
  })) as Row | null;
  const latest = row?.revisions[0];
  if (!row || !latest) return { ok: false, error: "not_found" };
  if (latest.id !== revisionId) return { ok: false, error: "stale" };
  if (latest.status === "DRAFT") {
    await db.candidateEvidenceRevision.updateMany({
      where: { id: revisionId, workspaceId, status: "DRAFT" },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });
    await db.candidateEvidence.update({ where: { id }, data: {} });
    await recordAuditEvent(workspaceId, "evidence.confirmed", { kind: latest.kind });
  }
  return { ok: true, id, revisionId };
}

/** Deletes the item and every revision. Saved CVs keep their own text and
 *  the revision ids they used; the evidence text itself is gone. */
export async function deleteEvidence(workspaceId: string, id: string): Promise<boolean> {
  const { count } = await getJobmatchDb().candidateEvidence.deleteMany({ where: { id, workspaceId } });
  if (count > 0) await recordAuditEvent(workspaceId, "evidence.deleted", {});
  return count > 0;
}
