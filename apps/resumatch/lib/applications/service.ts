import "server-only";
import { getJobmatchDb } from "../db/client";
import type { Prisma } from "../db/generated";
import { recordAuditEvent } from "../workspace";
import { applicationAuditEvents } from "./audit";
import type { ApplicationStatusName } from "./constants";
import { FOLLOW_UP_CLOSED_STATUSES, followUpDayToDate } from "./followUp";
import { pageCount, type ApplicationListQuery, type ApplicationSort } from "./listQuery";
import { appliedAtForStatusChange } from "./status";

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
      appliedAt: input.status === "APPLIED" ? new Date() : null,
    },
  });

  await recordAuditEvent(workspaceId, "application.created", {
    applicationId: application.id,
    targetJobId: application.targetJobId,
    status: application.status,
  });
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

  // The before-state is read here so the audit trail can record what
  // actually changed (applicationAuditEvents), not just that a PATCH ran.
  const existing = await db.application.findFirst({
    where: { id, workspaceId },
    select: { id: true, targetJobId: true, status: true, notes: true, followUpDate: true, tailoredResumeId: true, appliedAt: true },
  });
  if (!existing) throw new ApplicationNotFoundError();

  if (input.tailoredResumeId) {
    const resume = await db.tailoredResume.findFirst({
      where: { id: input.tailoredResumeId, workspaceId },
      select: { id: true },
    });
    if (!resume) throw new ApplicationNotFoundError("tailoredResume");
  }

  const events = applicationAuditEvents(
    { applicationId: existing.id, targetJobId: existing.targetJobId },
    existing,
    input,
  );
  // Nothing actually changes (a repeated save, or the same status clicked
  // again): skip the write so `updatedAt` stays honest, and return the row
  // as it is.
  if (events.length === 0) {
    return db.application.findFirstOrThrow({ where: { id, workspaceId } });
  }

  const appliedAt =
    input.status !== undefined
      ? appliedAtForStatusChange(existing.status as ApplicationStatusName, input.status, existing.appliedAt, new Date())
      : undefined;

  const application = await db.application.update({
    where: { id },
    data: {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(appliedAt !== undefined ? { appliedAt } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.followUpDate !== undefined ? { followUpDate: input.followUpDate } : {}),
      ...(input.tailoredResumeId !== undefined ? { tailoredResumeId: input.tailoredResumeId } : {}),
    },
  });

  for (const event of events) {
    await recordAuditEvent(workspaceId, event.action, event.metadata);
  }
  return application;
}

/** The row shape the list page and `GET /api/applications` return. Notes
 *  are included because the row edits them; they are never searched. */
const LIST_INCLUDE = {
  targetJob: { select: { title: true, employer: true, sourceUrl: true } },
  tailoredResume: { select: { id: true, createdAt: true, coverLetter: { select: { id: true } } } },
  // The newest accepted (or unresolved) email, for the card's "Sent" line
  // and its link to that exact message.
  sentEmails: {
    orderBy: [{ attemptedAt: "desc" }, { id: "desc" }],
    take: 1,
    select: { id: true, status: true, attemptedAt: true, sentAt: true, contactEmail: true, additionalRecipients: true },
  },
  // The newest timeline entry, for the card's "Latest activity" line
  // (application-timeline.md); the full history is on the timeline page.
  events: {
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: 1,
    select: { kind: true, occurredAt: true, timeZone: true },
  },
  _count: { select: { sentEmails: true, events: true } },
} satisfies Prisma.ApplicationInclude;

const VIA_CHANNEL = {
  indeed: "INDEED",
  linkedin: "LINKEDIN",
  company: "COMPANY_WEBSITE",
  other: "OTHER",
} as const;

/** The `where` for a list query, always inside `workspaceId`. Due filters
 *  compare days: the stored value is a day at UTC midnight, so "today" is
 *  `[today 00:00Z, tomorrow 00:00Z)`. Using a range rather than equality
 *  also files a legacy timestamp row under its UTC day, as the row shows it
 *  (lib/applications/followUp.ts). Closed applications and rows without a
 *  date never match a due filter, the same rule as the due badge. */
export function applicationListWhere(workspaceId: string, query: ApplicationListQuery): Prisma.ApplicationWhereInput {
  const and: Prisma.ApplicationWhereInput[] = [{ workspaceId }];
  if (query.status) and.push({ status: query.status });
  if (query.via) {
    // Channel and email delivery are separate facts (application-
    // timeline.md): "email" means an email sent from ResuMatch was
    // accepted, never a recorded external submission.
    if (query.via === "email") and.push({ sentEmails: { some: { status: "ACCEPTED" } } });
    else if (query.via === "external") and.push({ submissionChannel: { not: null } });
    else and.push({ submissionChannel: VIA_CHANNEL[query.via] });
  }
  if (query.q) {
    // Prisma passes `contains` to ILIKE without escaping, so "%" or "_" in
    // the search would act as wildcards. Searched as typed instead.
    const text = query.q.replace(/[\\%_]/g, (c) => `\\${c}`);
    and.push({
      targetJob: {
        OR: [
          { title: { contains: text, mode: "insensitive" } },
          { employer: { contains: text, mode: "insensitive" } },
        ],
      },
    });
  }
  if (query.due) {
    if (!query.today) throw new Error("A due filter needs the client's today");
    const start = followUpDayToDate(query.today);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const range =
      query.due === "overdue" ? { lt: start } : query.due === "today" ? { gte: start, lt: end } : { gte: end };
    and.push({ followUpDate: range, status: { notIn: [...FOLLOW_UP_CLOSED_STATUSES] } });
  }
  return { AND: and };
}

/** Always ends in the id, so rows with equal dates or timestamps keep one
 *  order across requests and offset pages never repeat or skip a row. */
export function applicationListOrderBy(sort: ApplicationSort): Prisma.ApplicationOrderByWithRelationInput[] {
  if (sort === "applied") {
    return [{ appliedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }, { id: "desc" }];
  }
  if (sort === "followUp") {
    return [{ followUpDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }, { id: "desc" }];
  }
  return [{ createdAt: "desc" }, { id: "desc" }];
}

export interface ApplicationListPage<Row> {
  applications: Row[];
  /** Rows matching the filters, in this workspace. */
  total: number;
  /** All rows in this workspace, to tell "no matches" from "empty tracker". */
  workspaceTotal: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/**
 * One page of the tracker (issue #897). Every count and row is scoped to
 * `workspaceId`; the query must come from `parseApplicationListQuery`, so
 * the page size is already bounded. With `clampPage`, a page past the end
 * (the last row of the last page was just filtered out by an edit) shows the
 * last page instead; without it (the API), it is an empty page.
 */
export async function listApplicationPage(
  workspaceId: string,
  query: ApplicationListQuery,
  options: { clampPage?: boolean } = {},
) {
  const db = getJobmatchDb();
  const where = applicationListWhere(workspaceId, query);
  const [total, workspaceTotal] = await db.$transaction([
    db.application.count({ where }),
    db.application.count({ where: { workspaceId } }),
  ]);
  const pages = pageCount(total, query.pageSize);
  const page = options.clampPage ? Math.min(query.page, pages) : query.page;
  const applications =
    (page - 1) * query.pageSize >= total
      ? []
      : await db.application.findMany({
          where,
          orderBy: applicationListOrderBy(query.sort),
          skip: (page - 1) * query.pageSize,
          take: query.pageSize,
          include: LIST_INCLUDE,
        });
  return { applications, total, workspaceTotal, page, pageSize: query.pageSize, pageCount: pages };
}

export type ApplicationListRow = Awaited<ReturnType<typeof listApplicationPage>>["applications"][number];
