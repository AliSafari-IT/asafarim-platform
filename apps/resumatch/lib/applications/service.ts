import "server-only";
import { getJobmatchDb } from "../db/client";
import { recordAuditEvent } from "../workspace";
import type { ApplicationStatusName } from "./constants";

/**
 * Per-application tracking (issue #432). Every row is either user-supplied
 * (a `TargetJob` the candidate already created via one of the tailor
 * intake paths) or derived from an AI call the candidate already approved
 * (a `TailoredResume`) — no ingestion, no scraping, zero licensing
 * exposure, unlike the pre-pivot tracked-jobs workflow this replaces.
 *
 * Every read/write is scoped to `{ workspaceId, ... }` from the session,
 * the same authorization pattern the rest of the app uses (see
 * lib/workspace.ts) — a `targetJobId`/`tailoredResumeId` from the client
 * can only ever reference a row that is *also* checked to belong to the
 * caller's own workspace before use.
 */

export interface CreateApplicationInput {
  targetJobId: string;
  tailoredResumeId?: string | null;
  status?: ApplicationStatusName;
  notes?: string | null;
  followUpDate?: Date | null;
}

export async function createApplication(workspaceId: string, input: CreateApplicationInput) {
  const db = getJobmatchDb();

  const targetJob = await db.targetJob.findFirst({
    where: { id: input.targetJobId, workspaceId },
    select: { id: true },
  });
  if (!targetJob) throw new ApplicationNotFoundError("targetJob");

  if (input.tailoredResumeId) {
    const resume = await db.tailoredResume.findFirst({
      where: { id: input.tailoredResumeId, workspaceId },
      select: { id: true },
    });
    if (!resume) throw new ApplicationNotFoundError("tailoredResume");
  }

  const application = await db.application.create({
    data: {
      workspaceId,
      targetJobId: input.targetJobId,
      tailoredResumeId: input.tailoredResumeId ?? null,
      status: input.status ?? "SAVED",
      notes: input.notes ?? null,
      followUpDate: input.followUpDate ?? null,
    },
  });

  await recordAuditEvent(workspaceId, "application.created", { jobId: application.id });
  return application;
}

export interface UpdateApplicationInput {
  status?: ApplicationStatusName;
  notes?: string | null;
  followUpDate?: Date | null;
  tailoredResumeId?: string | null;
}

export class ApplicationNotFoundError extends Error {
  constructor(what: "application" | "targetJob" | "tailoredResume" = "application") {
    super(`${what} not found in this workspace`);
    this.name = "ApplicationNotFoundError";
  }
}

/** Scoped by `{ id, workspaceId }` together — never trusts a bare id from
 *  the client, the same IDOR-resistant pattern `lib/tracking/service.ts`
 *  used pre-pivot. */
export async function updateApplication(workspaceId: string, id: string, input: UpdateApplicationInput) {
  const db = getJobmatchDb();

  const existing = await db.application.findFirst({ where: { id, workspaceId }, select: { id: true } });
  if (!existing) throw new ApplicationNotFoundError();

  if (input.tailoredResumeId) {
    const resume = await db.tailoredResume.findFirst({
      where: { id: input.tailoredResumeId, workspaceId },
      select: { id: true },
    });
    if (!resume) throw new ApplicationNotFoundError("tailoredResume");
  }

  const application = await db.application.update({
    where: { id },
    data: {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.followUpDate !== undefined ? { followUpDate: input.followUpDate } : {}),
      ...(input.tailoredResumeId !== undefined ? { tailoredResumeId: input.tailoredResumeId } : {}),
    },
  });

  await recordAuditEvent(workspaceId, "application.updated", { jobId: application.id });
  return application;
}

export async function listApplications(workspaceId: string) {
  const db = getJobmatchDb();
  return db.application.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    include: {
      targetJob: { select: { title: true, employer: true, sourceUrl: true } },
      tailoredResume: { select: { id: true, createdAt: true } },
    },
  });
}
