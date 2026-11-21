import "server-only";
import { randomUUID } from "node:crypto";
import { getJobmatchDb } from "../db/client";
import type { ApplicationStatus, DocumentPdfKind, SentEmailStatus } from "../db/generated";
import type { ApplicationStatusName } from "../applications/constants";
import { describeTransition, statusAfterAcceptedEmail } from "../applications/status";
import { getPdfStatus, readPdfBytes, type PdfStatus, type PdfSummary } from "../documentPdfs/service";
import { log, logError } from "../observability/logger";
import { parseCoverLetterContent } from "../tailoring/ai/coverLetter/schema";
import { parseTailoredResumeContent } from "../tailoring/ai/schema";
import { recordAuditEvent } from "../workspace";
import { getApplicationEmailConfig, senderDisplayName, type ApplicationEmailConfig } from "./config";
import { getApplicationMailer, type ApplicationMailer, type OutgoingEmail, type SendOutcome } from "./mailer";
import {
  cleanBody,
  cleanHeaderText,
  companyKey,
  normalizeEmail,
  validateForSend,
  type DraftField,
  type DraftSaveInput,
  type FieldProblem,
  type SendRequest,
} from "./normalize";
import { prefillRecipient, type Prefill } from "./prefill";

/**
 * Drafts and sending for application emails (send-application.md).
 *
 * The send is built so that no failure can produce a duplicate email or a
 * wrong "Applied":
 *
 * 1. The draft is saved first, so the candidate's text survives whatever
 *    happens next.
 * 2. A `SENDING` row holding the full snapshot (recipient, subject, body,
 *    the exact PDF rows and their hashes) is written BEFORE the provider is
 *    called, keyed by the browser's idempotency key. A retried request with
 *    the same key finds that row and reports its outcome instead of sending
 *    again.
 * 3. Only a provider acceptance moves the row to `ACCEPTED` and, in the same
 *    transaction, a Saved application to Applied. A refusal is `FAILED`
 *    (status untouched). A broken connection after hand-over is `UNCERTAIN`:
 *    never resent automatically; the candidate must confirm a resend.
 * 4. If the database fails after the provider accepted, the acceptance is
 *    retried in the background and, failing that, the row stays `SENDING`;
 *    `reconcileSentEmails` later applies any missing status transition and
 *    shows a stale `SENDING` row as unconfirmed, never as "not sent".
 */

/** A SENDING row older than this was never resolved: shown as unconfirmed. */
export const SENDING_STALE_MS = 3 * 60 * 1000;

export interface DraftView {
  version: number;
  toEmail: string;
  contactName: string;
  subject: string;
  body: string;
  subjectEdited: boolean;
  bodyEdited: boolean;
  sendCopyToSelf: boolean;
  cvPdfId: string | null;
  coverLetterPdfId: string | null;
  updatedAt: string;
}

export interface AttachmentView {
  kind: DocumentPdfKind;
  pdf: PdfSummary;
  /** False when the CV or letter changed after this PDF was made. */
  current: boolean;
  /** A newer up-to-date PDF exists than the one pinned. */
  newerAvailable: PdfSummary | null;
}

export type ComposerProblem =
  | "no_cv"
  | "no_cover_letter"
  | "pdfs_missing"
  | "pins_invalid";

export interface ComposerData {
  application: {
    id: string;
    status: ApplicationStatusName;
    appliedAt: string | null;
    jobTitle: string | null;
    employer: string | null;
    tailoredResumeId: string | null;
    coverLetterId: string | null;
  };
  problems: ComposerProblem[];
  pdfStatus: PdfStatus | null;
  attachments: { cv: AttachmentView | null; letter: AttachmentView | null };
  draft: DraftView | null;
  prefill: Prefill;
  candidateName: string | null;
  lastSent: { id: string; status: SentEmailStatus; attemptedAt: string; sentAt: string | null; contactEmail: string } | null;
  /** An unresolved earlier send for this application. */
  unresolved: { id: string; status: "SENDING" | "UNCERTAIN"; attemptedAt: string; stale: boolean } | null;
  sendCount: number;
}

function toDraftView(row: {
  version: number;
  toEmail: string | null;
  contactName: string | null;
  subject: string | null;
  body: string | null;
  subjectEdited: boolean;
  bodyEdited: boolean;
  sendCopyToSelf: boolean;
  cvPdfId: string | null;
  coverLetterPdfId: string | null;
  updatedAt: Date;
}): DraftView {
  return {
    version: row.version,
    toEmail: row.toEmail ?? "",
    contactName: row.contactName ?? "",
    subject: row.subject ?? "",
    body: row.body ?? "",
    subjectEdited: row.subjectEdited,
    bodyEdited: row.bodyEdited,
    sendCopyToSelf: row.sendCopyToSelf,
    cvPdfId: row.cvPdfId,
    coverLetterPdfId: row.coverLetterPdfId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const DRAFT_SELECT = {
  version: true,
  toEmail: true,
  contactName: true,
  subject: true,
  body: true,
  subjectEdited: true,
  bodyEdited: true,
  sendCopyToSelf: true,
  cvPdfId: true,
  coverLetterPdfId: true,
  updatedAt: true,
} as const;

async function loadApplication(workspaceId: string, applicationId: string) {
  return getJobmatchDb().application.findFirst({
    where: { id: applicationId, workspaceId },
    select: {
      id: true,
      status: true,
      appliedAt: true,
      targetJobId: true,
      tailoredResumeId: true,
      targetJob: { select: { title: true, employer: true, rawText: true, structuredFields: true } },
      tailoredResume: { select: { id: true, content: true, coverLetter: { select: { id: true, content: true } } } },
    },
  });
}

type LoadedApplication = NonNullable<Awaited<ReturnType<typeof loadApplication>>>;

/** Whether a PDF row is the right document for this application: the CV
 *  PDF of its own tailored CV, the letter PDF of that CV's own letter. */
export function pdfBelongs(
  pdf: Pick<PdfSummary, "kind" | "tailoredResumeId" | "coverLetterId"> | null,
  kind: DocumentPdfKind,
  documents: { tailoredResumeId: string | null; coverLetterId: string | null },
): boolean {
  if (!pdf || pdf.kind !== kind) return false;
  if (kind === "CV") return Boolean(documents.tailoredResumeId) && pdf.tailoredResumeId === documents.tailoredResumeId;
  return Boolean(documents.coverLetterId) && pdf.coverLetterId === documents.coverLetterId;
}

async function pinnedPdf(workspaceId: string, pdfId: string | null): Promise<PdfSummary | null> {
  if (!pdfId) return null;
  return getJobmatchDb().documentPdf.findFirst({
    where: { id: pdfId, workspaceId },
    select: {
      id: true,
      kind: true,
      filename: true,
      byteSize: true,
      contentHash: true,
      createdAt: true,
      tailoredResumeId: true,
      coverLetterId: true,
      sourceFingerprint: true,
    },
  });
}

function attachmentView(kind: DocumentPdfKind, pdf: PdfSummary, status: PdfStatus): AttachmentView {
  const state = kind === "CV" ? status.cv : status.letter;
  const fingerprint = kind === "CV" ? status.sources.cv.fingerprint : status.sources.letter?.fingerprint;
  const current = pdf.sourceFingerprint === fingerprint;
  const latest = state?.latest ?? null;
  const newerAvailable = !current && latest && latest.id !== pdf.id && state?.current ? latest : null;
  return { kind, pdf, current, newerAvailable };
}

export async function loadComposer(
  workspaceId: string,
  applicationId: string,
  now: Date = new Date(),
): Promise<ComposerData | null> {
  await reconcileSentEmails(workspaceId, now);
  const db = getJobmatchDb();
  const application = await loadApplication(workspaceId, applicationId);
  if (!application) return null;

  const tailoredResumeId = application.tailoredResume?.id ?? null;
  const coverLetterId = application.tailoredResume?.coverLetter?.id ?? null;
  const documents = { tailoredResumeId, coverLetterId };
  const problems: ComposerProblem[] = [];
  if (!tailoredResumeId) problems.push("no_cv");
  else if (!coverLetterId) problems.push("no_cover_letter");

  const pdfStatus = tailoredResumeId ? await getPdfStatus(workspaceId, tailoredResumeId) : null;
  const draftRow = await db.applicationEmailDraft.findUnique({ where: { applicationId }, select: DRAFT_SELECT });
  const draft = draftRow ? toDraftView(draftRow) : null;

  let cv: AttachmentView | null = null;
  let letter: AttachmentView | null = null;
  if (pdfStatus && coverLetterId) {
    let pinsInvalid = false;
    const pinnedCv = draft?.cvPdfId ? await pinnedPdf(workspaceId, draft.cvPdfId) : null;
    const pinnedLetter = draft?.coverLetterPdfId ? await pinnedPdf(workspaceId, draft.coverLetterPdfId) : null;
    if (draft?.cvPdfId && !pdfBelongs(pinnedCv, "CV", documents)) pinsInvalid = true;
    if (draft?.coverLetterPdfId && !pdfBelongs(pinnedLetter, "COVER_LETTER", documents)) pinsInvalid = true;

    // A pinned PDF that no longer matches this application (the application
    // now uses another CV) is never sent: the candidate is told, and the
    // current PDFs are offered instead.
    const cvPdf = pinsInvalid ? pdfStatus.cv.latest : (pinnedCv ?? pdfStatus.cv.latest);
    const letterPdf = pinsInvalid ? (pdfStatus.letter?.latest ?? null) : (pinnedLetter ?? pdfStatus.letter?.latest ?? null);
    if (pinsInvalid) problems.push("pins_invalid");
    if (cvPdf) cv = attachmentView("CV", cvPdf, pdfStatus);
    if (letterPdf) letter = attachmentView("COVER_LETTER", letterPdf, pdfStatus);
    if (!cvPdf || !letterPdf) problems.push("pdfs_missing");
  }

  const [lastAccepted, lastAny, unresolvedRow, sendCount] = await Promise.all([
    db.sentApplicationEmail.findFirst({
      where: { workspaceId, applicationId, status: "ACCEPTED" },
      orderBy: [{ attemptedAt: "desc" }, { id: "desc" }],
      select: { contactEmail: true, contactName: true },
    }),
    db.sentApplicationEmail.findFirst({
      where: { workspaceId, applicationId },
      orderBy: [{ attemptedAt: "desc" }, { id: "desc" }],
      select: { id: true, status: true, attemptedAt: true, sentAt: true, contactEmail: true },
    }),
    db.sentApplicationEmail.findFirst({
      where: { workspaceId, applicationId, status: { in: ["SENDING", "UNCERTAIN"] } },
      orderBy: [{ attemptedAt: "desc" }, { id: "desc" }],
      select: { id: true, status: true, attemptedAt: true },
    }),
    db.sentApplicationEmail.count({ where: { workspaceId, applicationId } }),
  ]);

  const cvContent = application.tailoredResume ? parseTailoredResumeContent(application.tailoredResume.content) : null;
  const letterContent = application.tailoredResume?.coverLetter ? parseCoverLetterContent(application.tailoredResume.coverLetter.content) : null;

  return {
    application: {
      id: application.id,
      status: application.status as ApplicationStatusName,
      appliedAt: application.appliedAt?.toISOString() ?? null,
      jobTitle: application.targetJob.title,
      employer: application.targetJob.employer,
      tailoredResumeId,
      coverLetterId,
    },
    problems,
    pdfStatus,
    attachments: { cv, letter },
    draft,
    prefill: prefillRecipient({
      structuredFields: application.targetJob.structuredFields,
      rawText: application.targetJob.rawText,
      previous: lastAccepted,
    }),
    candidateName: letterContent?.fullName ?? cvContent?.fullName ?? null,
    lastSent: lastAny
      ? {
          id: lastAny.id,
          status: lastAny.status,
          attemptedAt: lastAny.attemptedAt.toISOString(),
          sentAt: lastAny.sentAt?.toISOString() ?? null,
          contactEmail: lastAny.contactEmail,
        }
      : null,
    unresolved: unresolvedRow
      ? {
          id: unresolvedRow.id,
          status: unresolvedRow.status as "SENDING" | "UNCERTAIN",
          attemptedAt: unresolvedRow.attemptedAt.toISOString(),
          stale: unresolvedRow.status === "UNCERTAIN" || now.getTime() - unresolvedRow.attemptedAt.getTime() > SENDING_STALE_MS,
        }
      : null,
    sendCount,
  };
}

// ─── Drafts ────────────────────────────────────────────────────────────────

export type SaveDraftOutcome =
  | { ok: true; draft: DraftView }
  | { ok: false; reason: "not_found" | "conflict" | "attachment_mismatch"; current?: DraftView };

export async function saveDraft(workspaceId: string, applicationId: string, input: DraftSaveInput): Promise<SaveDraftOutcome> {
  const db = getJobmatchDb();
  const application = await loadApplication(workspaceId, applicationId);
  if (!application) return { ok: false, reason: "not_found" };

  const documents = {
    tailoredResumeId: application.tailoredResume?.id ?? null,
    coverLetterId: application.tailoredResume?.coverLetter?.id ?? null,
  };
  if (input.cvPdfId && !pdfBelongs(await pinnedPdf(workspaceId, input.cvPdfId), "CV", documents)) {
    return { ok: false, reason: "attachment_mismatch" };
  }
  if (input.coverLetterPdfId && !pdfBelongs(await pinnedPdf(workspaceId, input.coverLetterPdfId), "COVER_LETTER", documents)) {
    return { ok: false, reason: "attachment_mismatch" };
  }

  const data = {
    toEmail: input.toEmail.trim() || null,
    contactName: cleanHeaderText(input.contactName) || null,
    subject: input.subject.replace(/\s+/g, " ").trim() || null,
    body: cleanBody(input.body) || null,
    subjectEdited: input.subjectEdited,
    bodyEdited: input.bodyEdited,
    sendCopyToSelf: input.sendCopyToSelf,
    cvPdfId: input.cvPdfId,
    coverLetterPdfId: input.coverLetterPdfId,
  };

  if (input.version === null) {
    try {
      const created = await db.applicationEmailDraft.create({
        data: { ...data, workspaceId, applicationId },
        select: DRAFT_SELECT,
      });
      return { ok: true, draft: toDraftView(created) };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const current = await db.applicationEmailDraft.findUnique({ where: { applicationId }, select: DRAFT_SELECT });
      return { ok: false, reason: "conflict", current: current ? toDraftView(current) : undefined };
    }
  }

  // Compare-and-set on the version, so two tabs can't overwrite each other
  // without one of them being told.
  const updated = await db.applicationEmailDraft.updateMany({
    where: { applicationId, workspaceId, version: input.version },
    data: { ...data, version: { increment: 1 } },
  });
  const current = await db.applicationEmailDraft.findUnique({ where: { applicationId }, select: DRAFT_SELECT });
  if (updated.count === 0) {
    return { ok: false, reason: current ? "conflict" : "not_found", current: current ? toDraftView(current) : undefined };
  }
  return { ok: true, draft: toDraftView(current!) };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

// ─── Sending ───────────────────────────────────────────────────────────────

export interface SendContext {
  /** From the session; Reply-To and the optional Bcc copy. */
  accountEmail: string | null;
  accountName: string | null;
}

export interface SendDeps {
  config?: ApplicationEmailConfig;
  mailer?: ApplicationMailer | null;
  now?: () => Date;
  /** Background retry of a failed acceptance write; tests pass a no-op. */
  scheduleRetry?: (task: () => Promise<boolean>) => void;
}

export type SendResult =
  | { outcome: "accepted"; sentId: string; applicationStatus: ApplicationStatusName; recorded: boolean; replayed: boolean; draft: DraftView | null }
  | { outcome: "failed"; sentId: string; errorCode: string; replayed: boolean; draft: DraftView | null }
  | { outcome: "uncertain"; sentId: string; replayed: boolean; draft: DraftView | null }
  | { outcome: "in_progress"; sentId: string }
  | {
      outcome: "invalid";
      reason:
        | "not_found"
        | "not_configured"
        | "fields"
        | "attachments"
        | "attachment_unreadable"
        | "draft_conflict"
        | "unresolved_send"
        | "rate_limited"
        | "no_reply_address"
        | "key_reused";
      fields?: Partial<Record<DraftField, FieldProblem>>;
      draft?: DraftView | null;
    };

function idempotencyKeyFor(workspaceId: string, clientKey: string): string {
  return `${workspaceId}:${clientKey}`;
}

function replay(row: { id: string; status: SentEmailStatus; errorCode: string | null; attemptedAt: Date }, now: Date, applicationStatus: ApplicationStatusName): SendResult {
  if (row.status === "ACCEPTED") return { outcome: "accepted", sentId: row.id, applicationStatus, recorded: true, replayed: true, draft: null };
  if (row.status === "FAILED") return { outcome: "failed", sentId: row.id, errorCode: row.errorCode ?? "UNKNOWN", replayed: true, draft: null };
  if (row.status === "UNCERTAIN" || now.getTime() - row.attemptedAt.getTime() > SENDING_STALE_MS) {
    return { outcome: "uncertain", sentId: row.id, replayed: true, draft: null };
  }
  return { outcome: "in_progress", sentId: row.id };
}

export async function sendApplicationEmail(
  workspaceId: string,
  applicationId: string,
  request: SendRequest & { confirmResend?: boolean },
  context: SendContext,
  deps: SendDeps = {},
): Promise<SendResult> {
  const db = getJobmatchDb();
  const now = deps.now ?? (() => new Date());
  const config = deps.config ?? getApplicationEmailConfig();
  const key = idempotencyKeyFor(workspaceId, request.idempotencyKey);

  const application = await loadApplication(workspaceId, applicationId);
  if (!application) return { outcome: "invalid", reason: "not_found" };

  // 1. The same send intent, again: report what happened, never resend.
  const existing = await db.sentApplicationEmail.findUnique({
    where: { idempotencyKey: key },
    select: { id: true, status: true, errorCode: true, attemptedAt: true, applicationId: true },
  });
  if (existing) {
    if (existing.applicationId !== applicationId) return { outcome: "invalid", reason: "key_reused" };
    return replay(existing, now(), application.status as ApplicationStatusName);
  }

  // 2. Keep the candidate's text, whatever happens next.
  const saved = await saveDraft(workspaceId, applicationId, request.draft);
  if (!saved.ok) {
    if (saved.reason === "conflict") return { outcome: "invalid", reason: "draft_conflict", draft: saved.current ?? null };
    if (saved.reason === "attachment_mismatch") return { outcome: "invalid", reason: "attachments" };
    return { outcome: "invalid", reason: "not_found" };
  }
  const draft = saved.draft;

  const mailer = deps.mailer !== undefined ? deps.mailer : await getApplicationMailer(config);
  if (!mailer || config.unavailableReason || !config.fromAddress) return { outcome: "invalid", reason: "not_configured", draft };

  const fields = validateForSend(draft);
  if (Object.keys(fields).length > 0) return { outcome: "invalid", reason: "fields", fields, draft };

  const replyTo = context.accountEmail?.trim() || null;
  if (!replyTo) return { outcome: "invalid", reason: "no_reply_address", draft };

  // 3. Exactly this application's CV and letter, the pinned versions, with
  //    bytes that still match the hash recorded when they were made.
  const documents = {
    tailoredResumeId: application.tailoredResume?.id ?? null,
    coverLetterId: application.tailoredResume?.coverLetter?.id ?? null,
  };
  if (!draft.cvPdfId || !draft.coverLetterPdfId) return { outcome: "invalid", reason: "attachments", draft };
  const [cvBytes, letterBytes] = await Promise.all([
    readPdfBytes(workspaceId, draft.cvPdfId),
    readPdfBytes(workspaceId, draft.coverLetterPdfId),
  ]);
  if (!cvBytes.ok || !letterBytes.ok) {
    const reason = (!cvBytes.ok && cvBytes.reason === "not_found") || (!letterBytes.ok && letterBytes.reason === "not_found") ? "attachments" : "attachment_unreadable";
    return { outcome: "invalid", reason, draft };
  }
  if (!pdfBelongs(cvBytes.pdf, "CV", documents) || !pdfBelongs(letterBytes.pdf, "COVER_LETTER", documents)) {
    return { outcome: "invalid", reason: "attachments", draft };
  }

  // 5. The snapshot, written before the provider is called.
  const candidateName = parseCoverLetterContent(application.tailoredResume!.coverLetter!.content).fullName
    ?? parseTailoredResumeContent(application.tailoredResume!.content).fullName
    ?? context.accountName;
  const fromName = senderDisplayName(candidateName, config);
  const messageId = `<${randomUUID()}@${config.messageIdDomain}>`;
  const toEmail = draft.toEmail.trim();
  const contactName = cleanHeaderText(draft.contactName) || null;
  const subject = cleanHeaderText(draft.subject);
  const body = cleanBody(draft.body);
  const bcc = draft.sendCopyToSelf ? replyTo : null;
  const employer = application.targetJob.employer;

  type Claim = { ok: true; id: string } | { ok: false; result: SendResult };
  let claim: Claim;
  try {
    claim = await db.$transaction(async (tx): Promise<Claim> => {
      // Serialises sends for one application, so two tabs (two different
      // keys) can't both pass the checks below and both send.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`resumatch:send:${applicationId}`}))`;

      // 4. One unresolved send at a time. An uncertain one needs the
      //    candidate's explicit "send again", since it may have gone out.
      const unresolved = await tx.sentApplicationEmail.findFirst({
        where: { workspaceId, applicationId, status: { in: ["SENDING", "UNCERTAIN"] } },
        orderBy: { attemptedAt: "desc" },
        select: { id: true, status: true, attemptedAt: true },
      });
      if (unresolved) {
        const stale = unresolved.status === "UNCERTAIN" || now().getTime() - unresolved.attemptedAt.getTime() > SENDING_STALE_MS;
        if (!stale) return { ok: false, result: { outcome: "in_progress", sentId: unresolved.id } };
        if (!request.confirmResend) return { ok: false, result: { outcome: "invalid", reason: "unresolved_send", draft } };
      }

      const since = new Date(now().getTime() - 24 * 60 * 60 * 1000);
      const recent = await tx.sentApplicationEmail.count({
        where: { workspaceId, attemptedAt: { gte: since }, status: { in: ["SENDING", "ACCEPTED", "UNCERTAIN"] } },
      });
      if (recent >= config.dailyLimit) return { ok: false, result: { outcome: "invalid", reason: "rate_limited", draft } };

      const row = await tx.sentApplicationEmail.create({
        data: {
          workspaceId,
          applicationId,
          idempotencyKey: key,
          targetJobId: application.targetJobId,
          companyKey: companyKey(employer),
          companyName: employer?.trim() || application.targetJob.title?.trim() || "—",
          jobTitle: application.targetJob.title,
          contactName,
          contactEmail: toEmail,
          contactEmailNormalized: normalizeEmail(toEmail),
          fromAddress: `${fromName} <${config.fromAddress}>`,
          replyTo,
          bccSelf: bcc,
          subject,
          body,
          messageId,
          status: "SENDING",
          attemptedAt: now(),
          attachments: {
            create: [cvBytes.pdf, letterBytes.pdf].map((pdf) => ({
              documentPdfId: pdf.id,
              kind: pdf.kind,
              filename: pdf.filename,
              contentHash: pdf.contentHash,
              byteSize: pdf.byteSize,
            })),
          },
        },
        select: { id: true },
      });
      return { ok: true, id: row.id };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      // A concurrent request with the same key won the insert.
      const raced = await db.sentApplicationEmail.findUnique({
        where: { idempotencyKey: key },
        select: { id: true, status: true, errorCode: true, attemptedAt: true },
      });
      if (raced) return replay(raced, now(), application.status as ApplicationStatusName);
    }
    throw error;
  }
  if (!claim.ok) return claim.result;
  const sentId = claim.id;
  await recordAuditEvent(workspaceId, "application_email.send_started", { sentId, applicationId });

  // 6. The provider call. Subject, body and addresses never reach a log.
  const email: OutgoingEmail = {
    from: { name: fromName, address: config.fromAddress },
    to: { name: contactName, address: toEmail },
    replyTo,
    bcc,
    subject,
    text: body,
    messageId,
    attachments: [
      { filename: cvBytes.pdf.filename, content: cvBytes.bytes, contentType: "application/pdf" },
      { filename: letterBytes.pdf.filename, content: letterBytes.bytes, contentType: "application/pdf" },
    ],
  };
  let outcome: SendOutcome;
  try {
    outcome = await mailer.send(email);
  } catch (error) {
    // A mailer that throws instead of classifying: we cannot know.
    logError("application_email.mailer_threw", error, { sentId });
    outcome = { kind: "uncertain", code: "MAILER_THREW" };
  }

  if (outcome.kind === "accepted") {
    const sentAt = now();
    const result = await recordAcceptance(workspaceId, sentId, outcome, sentAt);
    if (!result.ok) {
      const schedule = deps.scheduleRetry ?? defaultScheduleRetry;
      schedule(async () => (await recordAcceptance(workspaceId, sentId, outcome as Extract<SendOutcome, { kind: "accepted" }>, sentAt)).ok);
    }
    await recordAuditEvent(workspaceId, "application_email.accepted", { sentId, applicationId, recorded: result.ok });
    return {
      outcome: "accepted",
      sentId,
      applicationStatus: result.ok ? result.status : statusAfterAcceptedEmail(application.status as ApplicationStatusName),
      recorded: result.ok,
      replayed: false,
      draft,
    };
  }

  const status: SentEmailStatus = outcome.kind === "rejected" ? "FAILED" : "UNCERTAIN";
  const errorCode = outcome.code;
  try {
    await db.sentApplicationEmail.update({
      where: { id: sentId },
      data: {
        status,
        errorCode,
        providerResponse: outcome.kind === "rejected" ? outcome.response : null,
      },
    });
  } catch (error) {
    // Left SENDING: shown as unconfirmed once stale, which is the safe
    // reading for both outcomes.
    logError("application_email.outcome_write_failed", error, { sentId, status });
  }
  log.warn("application_email.not_accepted", { sentId, status, errorCode });
  await recordAuditEvent(workspaceId, `application_email.${status.toLowerCase()}`, { sentId, applicationId, errorCode });
  return outcome.kind === "rejected"
    ? { outcome: "failed", sentId, errorCode, replayed: false, draft }
    : { outcome: "uncertain", sentId, replayed: false, draft };
}

function defaultScheduleRetry(task: () => Promise<boolean>): void {
  let attempt = 0;
  const run = () => {
    attempt += 1;
    task()
      .then((ok) => {
        if (!ok && attempt < 5) setTimeout(run, 2_000 * 2 ** attempt).unref?.();
      })
      .catch(() => {
        if (attempt < 5) setTimeout(run, 2_000 * 2 ** attempt).unref?.();
      });
  };
  setTimeout(run, 2_000).unref?.();
}

/**
 * Mark a sent email accepted and apply its status change, in one
 * transaction: the application can never be Applied without its accepted
 * email, nor the email accepted while a Saved application stays Saved.
 * Idempotent: a second call on an already-recorded row changes nothing.
 */
export async function recordAcceptance(
  workspaceId: string,
  sentId: string,
  outcome: Extract<SendOutcome, { kind: "accepted" }>,
  sentAt: Date,
): Promise<{ ok: true; status: ApplicationStatusName } | { ok: false }> {
  const db = getJobmatchDb();
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const status = await db.$transaction(async (tx) => {
        const row = await tx.sentApplicationEmail.findFirst({
          where: { id: sentId, workspaceId },
          select: { status: true, applicationId: true, statusTransition: true },
        });
        if (!row) throw new Error("SentEmailMissing");
        if (row.status !== "ACCEPTED") {
          await tx.sentApplicationEmail.update({
            where: { id: sentId },
            data: {
              status: "ACCEPTED",
              sentAt,
              providerMessageId: outcome.providerMessageId,
              providerResponse: outcome.response,
              errorCode: null,
            },
          });
        }
        return applyTransition(tx, workspaceId, sentId, row.applicationId, row.statusTransition, sentAt);
      });
      return { ok: true, status };
    } catch (error) {
      logError("application_email.accept_write_failed", error, { sentId, attempt });
    }
  }
  return { ok: false };
}

type Tx = Parameters<Parameters<ReturnType<typeof getJobmatchDb>["$transaction"]>[0]>[0];

async function applyTransition(
  tx: Tx,
  workspaceId: string,
  sentId: string,
  applicationId: string | null,
  existingTransition: string | null,
  sentAt: Date,
): Promise<ApplicationStatusName> {
  const app = applicationId
    ? await tx.application.findFirst({ where: { id: applicationId, workspaceId }, select: { status: true, appliedAt: true } })
    : null;
  if (!app) {
    // The application was deleted meanwhile: nothing to move.
    if (!existingTransition) await tx.sentApplicationEmail.update({ where: { id: sentId }, data: { statusTransition: "no application" } });
    return "APPLIED";
  }
  const before = app.status as ApplicationStatusName;
  if (existingTransition) return before;

  const after = statusAfterAcceptedEmail(before);
  const appliedAt = app.appliedAt ?? (after === "APPLIED" ? sentAt : null);
  if (after !== before || (appliedAt && !app.appliedAt)) {
    // Conditional on the status read above, so a concurrent manual change
    // is never overwritten by a stale value.
    await tx.application.updateMany({
      where: { id: applicationId!, workspaceId, status: before as ApplicationStatus },
      data: { status: after as ApplicationStatus, appliedAt },
    });
  }
  await tx.sentApplicationEmail.update({
    where: { id: sentId },
    data: { statusTransition: describeTransition(before, after), appliedAt },
  });
  return after;
}

/**
 * Finish what a crash or a database error left undone. Runs on the pages
 * that show sent emails, scoped to one workspace:
 * - an ACCEPTED email whose status change was never recorded gets it now
 *   (still only Saved -> Applied);
 * - a SENDING email older than SENDING_STALE_MS becomes UNCERTAIN: nobody
 *   knows whether it left, so it is neither "sent" nor "not sent".
 */
export async function reconcileSentEmails(workspaceId: string, now: Date = new Date()): Promise<void> {
  const db = getJobmatchDb();
  try {
    const pending = await db.sentApplicationEmail.findMany({
      where: { workspaceId, status: "ACCEPTED", statusTransition: null },
      select: { id: true, applicationId: true, sentAt: true },
      take: 20,
    });
    for (const row of pending) {
      await db.$transaction((tx) => applyTransition(tx, workspaceId, row.id, row.applicationId, null, row.sentAt ?? now));
    }
    await db.sentApplicationEmail.updateMany({
      where: { workspaceId, status: "SENDING", attemptedAt: { lt: new Date(now.getTime() - SENDING_STALE_MS) } },
      data: { status: "UNCERTAIN", errorCode: "OUTCOME_NOT_RECORDED" },
    });
  } catch (error) {
    logError("application_email.reconcile_failed", error, { workspaceId });
  }
}
