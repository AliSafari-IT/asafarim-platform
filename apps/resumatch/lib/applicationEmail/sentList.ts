import "server-only";
import { getJobmatchDb } from "../db/client";
import type { Prisma } from "../db/generated";
import { SENT_PAGE_SIZE, type SentListQuery } from "./sentQuery";
import { reconcileSentEmails, SENDING_STALE_MS } from "./service";

/**
 * Read side of the sent-application history. Read-only by construction:
 * nothing here writes a sent email's content, and no route exposes a write
 * (the snapshot is also protected by a database trigger).
 */

export function sentListWhere(workspaceId: string, query: SentListQuery): Prisma.SentApplicationEmailWhereInput {
  return {
    workspaceId,
    ...(query.company ? { companyKey: query.company } : {}),
    // Any recipient, whichever position it had (#944).
    ...(query.contact ? { recipientsNormalized: { has: query.contact } } : {}),
    ...(query.application ? { applicationId: query.application } : {}),
  };
}

export function sentListOrderBy(query: SentListQuery): Prisma.SentApplicationEmailOrderByWithRelationInput[] {
  const dir = query.sort === "oldest" ? "asc" : "desc";
  return [{ attemptedAt: dir }, { id: dir }];
}

const ROW_SELECT = {
  id: true,
  applicationId: true,
  companyKey: true,
  companyName: true,
  jobTitle: true,
  contactName: true,
  contactEmail: true,
  contactEmailNormalized: true,
  additionalRecipients: true,
  subject: true,
  status: true,
  deliveryStatus: true,
  appliedAt: true,
  attemptedAt: true,
  sentAt: true,
} as const;

export async function listSentEmails(workspaceId: string, query: SentListQuery, now: Date = new Date()) {
  await reconcileSentEmails(workspaceId, now);
  const db = getJobmatchDb();
  const where = sentListWhere(workspaceId, query);
  const [total, workspaceTotal] = await db.$transaction([
    db.sentApplicationEmail.count({ where }),
    db.sentApplicationEmail.count({ where: { workspaceId } }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / SENT_PAGE_SIZE));
  const page = Math.min(query.page, pageCount);
  const rows = await db.sentApplicationEmail.findMany({
    where,
    orderBy: sentListOrderBy(query),
    skip: (page - 1) * SENT_PAGE_SIZE,
    take: SENT_PAGE_SIZE,
    select: ROW_SELECT,
  });

  // Labels for the active filter chips, from this workspace's own rows.
  const [companyLabel, contactLabel, applicationLabel] = await Promise.all([
    query.company
      ? db.sentApplicationEmail.findFirst({ where: { workspaceId, companyKey: query.company }, orderBy: { attemptedAt: "desc" }, select: { companyName: true } })
      : null,
    query.contact
      ? db.sentApplicationEmail.findFirst({
          where: { workspaceId, recipientsNormalized: { has: query.contact } },
          orderBy: { attemptedAt: "desc" },
          select: { contactName: true, contactEmail: true, contactEmailNormalized: true },
        })
      : null,
    query.application
      ? db.application.findFirst({ where: { id: query.application, workspaceId }, select: { targetJob: { select: { title: true, employer: true } } } })
      : null,
  ]);

  return {
    rows: rows.map((row) => ({
      ...row,
      // A SENDING row past the window is shown as unconfirmed, even before
      // reconcile has rewritten it.
      status: row.status === "SENDING" && now.getTime() - row.attemptedAt.getTime() > SENDING_STALE_MS ? ("UNCERTAIN" as const) : row.status,
    })),
    total,
    workspaceTotal,
    page,
    pageCount,
    labels: {
      company: companyLabel?.companyName ?? null,
      // The contact name belongs to the first recipient only.
      contact: contactLabel
        ? contactLabel.contactEmailNormalized === query.contact
          ? contactLabel.contactName
            ? `${contactLabel.contactName} <${contactLabel.contactEmail}>`
            : contactLabel.contactEmail
          : query.contact
        : null,
      application: applicationLabel ? [applicationLabel.targetJob.title, applicationLabel.targetJob.employer].filter(Boolean).join(" · ") : null,
    },
  };
}

export type SentListRow = Awaited<ReturnType<typeof listSentEmails>>["rows"][number];

export async function getSentEmail(workspaceId: string, sentId: string) {
  await reconcileSentEmails(workspaceId);
  return getJobmatchDb().sentApplicationEmail.findFirst({
    where: { id: sentId, workspaceId },
    select: {
      ...ROW_SELECT,
      fromAddress: true,
      replyTo: true,
      bccSelf: true,
      rejectedRecipients: true,
      body: true,
      messageId: true,
      providerResponse: true,
      errorCode: true,
      deliveryUpdatedAt: true,
      statusTransition: true,
      targetJobId: true,
      attachments: {
        orderBy: { kind: "asc" },
        select: { id: true, kind: true, filename: true, contentHash: true, byteSize: true, documentPdfId: true, documentPdf: { select: { createdAt: true } } },
      },
    },
  });
}

export type SentEmailDetail = NonNullable<Awaited<ReturnType<typeof getSentEmail>>>;
