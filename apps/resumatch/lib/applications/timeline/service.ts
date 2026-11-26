import "server-only";
import { randomUUID } from "node:crypto";
import { getJobmatchDb } from "../../db/client";
import type { ApplicationStatus, Prisma } from "../../db/generated";
import { deleteDocumentBytes, hashBytes, putDocumentBytes, readDocumentBytes } from "../../documents/storage";
import { createScanner, decideFromVerdict } from "../../documents/scanner";
import { logError } from "../../observability/logger";
import { recordAuditEvent } from "../../workspace";
import type { ApplicationStatusName } from "../constants";
import { followUpDateToDay } from "../followUp";
import { appliedAtForStatusChange } from "../status";
import {
  checkAttachmentSelection,
  displayFilename,
  sniffAttachment,
  MAX_ATTACHMENTS_PER_EVENT,
  type AttachmentKindName,
} from "./attachments";
import type { CreateEventInput, EditSubmissionInput, EventKindName, RecordSubmissionInput, UpdateEventInput } from "./contract";
import { parseEml, readEmailPreview } from "./eml";
import { mergeTimeline, type AttachmentView, type EmailEntryView, type EventEntryView, type TimelineEntryView } from "./view";
import { recipientSummary } from "../../applicationEmail/normalize";

/**
 * External submissions and the application timeline
 * (application-timeline.md). Every read and write is scoped to
 * `{ workspaceId, ... }` from the session; an id from the client only ever
 * reaches a row that is checked to belong to that workspace.
 *
 * Three things stay apart:
 * - status (`Application.status`), changed only by the stepper, by an
 *   accepted email, by recording a submission (Saved -> Applied only), or
 *   by an explicit status change chosen with a timeline entry;
 * - the submission channel (the `submission*` columns), what the candidate
 *   recorded about an application made elsewhere;
 * - email delivery (SentApplicationEmail), which nothing here writes.
 */

export type TimelineFailure =
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "already_recorded" }
  | { ok: false; reason: "not_recorded" }
  | { ok: false; reason: "recorded_submission" }
  | { ok: false; reason: "files"; problem: string; file?: string }
  | { ok: false; reason: "scanner_unavailable" }
  | { ok: false; reason: "storage" };

export interface IncomingFile {
  name: string;
  bytes: Uint8Array;
}

const KEY_PREFIX = "resumatch/application-attachments";

function buildAttachmentKey(workspaceId: string, extension: string): string {
  return `${KEY_PREFIX}/${workspaceId}/${randomUUID()}.${extension}`;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

class AbortTx extends Error {
  constructor(readonly failure: TimelineFailure) {
    super(failure.reason);
  }
}

interface PreparedFile {
  kind: AttachmentKindName;
  contentType: string;
  filename: string;
  byteSize: number;
  contentHash: string;
  storageKey: string;
  emailPreview: Prisma.InputJsonValue | null;
  bytes: Uint8Array;
}

/**
 * Checks, sniffs and scans files, then stores them. Nothing is stored
 * unless every file passes: one bad file refuses the whole request, so a
 * half-saved entry never exists. Duplicate bytes in one request are kept
 * once.
 */
async function prepareFiles(
  workspaceId: string,
  files: IncomingFile[],
  alreadyOnEvent = 0,
): Promise<{ ok: true; files: PreparedFile[] } | TimelineFailure> {
  if (files.length === 0) return { ok: true, files: [] };
  const problem = checkAttachmentSelection(files.map((f) => ({ size: f.bytes.byteLength })), alreadyOnEvent);
  if (problem) return { ok: false, reason: "files", problem };

  const prepared: PreparedFile[] = [];
  const seen = new Set<string>();
  const scanner = createScanner();
  for (const file of files) {
    const sniff = sniffAttachment(file.bytes);
    if (!sniff.ok) return { ok: false, reason: "files", problem: sniff.reason, file: displayFilename(file.name, "file") };
    const contentHash = hashBytes(file.bytes);
    if (seen.has(contentHash)) continue;
    seen.add(contentHash);
    const verdict = await scanner.scan(file.bytes);
    const decision = decideFromVerdict(verdict);
    if (!decision.advance) {
      if (decision.reasonCode === "SCANNER_UNAVAILABLE") return { ok: false, reason: "scanner_unavailable" };
      return { ok: false, reason: "files", problem: "REJECTED_FILE", file: displayFilename(file.name, sniff.extension) };
    }
    prepared.push({
      kind: sniff.kind,
      contentType: sniff.contentType,
      filename: displayFilename(file.name, sniff.extension),
      byteSize: file.bytes.byteLength,
      contentHash,
      storageKey: buildAttachmentKey(workspaceId, sniff.extension),
      emailPreview: sniff.kind === "EMAIL" ? (parseEml(file.bytes) as unknown as Prisma.InputJsonValue) : null,
      bytes: file.bytes,
    });
  }

  const stored: PreparedFile[] = [];
  try {
    for (const file of prepared) {
      await putDocumentBytes(file.storageKey, file.bytes, file.contentType);
      stored.push(file);
    }
  } catch (error) {
    logError("application.attachment.store_failed", error);
    await discardStored(stored);
    return { ok: false, reason: "storage" };
  }
  return { ok: true, files: prepared };
}

/** Removes bytes stored for a request that then did not save. */
async function discardStored(files: { storageKey: string }[]) {
  for (const file of files) {
    try {
      if (!(await deleteDocumentBytes(file.storageKey))) logError("application.attachment.discard_failed", new Error("ObjectStillPresent"));
    } catch (error) {
      logError("application.attachment.discard_failed", error);
    }
  }
}

function attachmentRows(workspaceId: string, files: PreparedFile[]) {
  return files.map((f) => ({
    workspaceId,
    kind: f.kind,
    contentType: f.contentType,
    filename: f.filename,
    byteSize: f.byteSize,
    contentHash: f.contentHash,
    storageKey: f.storageKey,
    ...(f.emailPreview ? { emailPreview: f.emailPreview } : {}),
  }));
}

/**
 * Deletes attachments, bytes first: a row goes only once its bytes are
 * verified gone, so nothing private is ever left without a row pointing
 * at it. Returns how many could not be removed.
 */
async function removeAttachments(workspaceId: string, attachments: { id: string; storageKey: string }[]): Promise<number> {
  const db = getJobmatchDb();
  let failed = 0;
  for (const attachment of attachments) {
    try {
      if (await deleteDocumentBytes(attachment.storageKey)) {
        await db.applicationEventAttachment.deleteMany({ where: { id: attachment.id, workspaceId } });
      } else {
        failed += 1;
        logError("application.attachment.delete_failed", new Error("ObjectStillPresent"), { jobId: attachment.id });
      }
    } catch (error) {
      failed += 1;
      logError("application.attachment.delete_failed", error, { jobId: attachment.id });
    }
  }
  return failed;
}

async function findApplication(workspaceId: string, applicationId: string) {
  return getJobmatchDb().application.findFirst({
    where: { id: applicationId, workspaceId },
    select: {
      id: true,
      targetJobId: true,
      status: true,
      appliedAt: true,
      submissionChannel: true,
    },
  });
}

/** `Saved` becomes `Applied`; every later stage stays where it is. */
function statusAfterSubmission(current: ApplicationStatusName): ApplicationStatusName {
  return current === "SAVED" ? "APPLIED" : current;
}

// ─── External submission ────────────────────────────────────────────────

export type RecordResult = { ok: true; replay: boolean } | TimelineFailure;

/**
 * "Mark as applied externally". Writes the submission details, a
 * "Application submitted" entry and, when a confirmation was pasted or
 * attached, a separate "Confirmation received" entry, all in one
 * transaction. Never writes an email record.
 *
 * A repeated Save (same client key) finds the first one and changes
 * nothing; a second recording for the same application is refused, so the
 * details are edited instead.
 */
export async function recordExternalSubmission(
  workspaceId: string,
  applicationId: string,
  input: RecordSubmissionInput,
  files: IncomingFile[] = [],
): Promise<RecordResult> {
  const db = getJobmatchDb();
  const key = `${workspaceId}:${input.clientKey}`;
  const replay = await db.applicationEvent.findFirst({ where: { idempotencyKey: key, workspaceId, applicationId }, select: { id: true } });
  if (replay) return { ok: true, replay: true };

  const app = await findApplication(workspaceId, applicationId);
  if (!app) return { ok: false, reason: "not_found" };
  if (app.submissionChannel) return { ok: false, reason: "already_recorded" };

  const prepared = await prepareFiles(workspaceId, files);
  if (!prepared.ok) return prepared;

  const before = app.status as ApplicationStatusName;
  const after = statusAfterSubmission(before);
  const hasConfirmation = Boolean(input.confirmationText) || prepared.files.length > 0;
  try {
    await db.$transaction(async (tx) => {
      // Guarded on "nothing recorded yet", so two tabs can't both record.
      const updated = await tx.application.updateMany({
        where: { id: applicationId, workspaceId, submissionChannel: null },
        data: {
          status: after as ApplicationStatus,
          appliedAt: input.appliedAt.at,
          appliedTimeZone: input.appliedAt.timeZone,
          submissionChannel: input.channel,
          submissionChannelLabel: input.channel === "OTHER" ? input.channelLabel : null,
          applicationUrl: input.applicationUrl,
          submissionReference: input.reference,
          submissionRecordedAt: new Date(),
          ...(input.followUpDate ? { followUpDate: input.followUpDate } : {}),
        },
      });
      if (updated.count !== 1) throw new AbortTx({ ok: false, reason: "already_recorded" });

      await tx.applicationEvent.create({
        data: {
          workspaceId,
          applicationId,
          kind: "SUBMITTED",
          origin: "EXTERNAL_SUBMISSION",
          occurredAt: input.appliedAt.at,
          timeZone: input.appliedAt.timeZone,
          summary: input.notes,
          followUpDate: input.followUpDate,
          fromStatus: before !== after ? (before as ApplicationStatus) : null,
          toStatus: before !== after ? (after as ApplicationStatus) : null,
          idempotencyKey: key,
        },
      });
      if (hasConfirmation) {
        const at = input.confirmationAt ?? input.appliedAt;
        await tx.applicationEvent.create({
          data: {
            workspaceId,
            applicationId,
            kind: "CONFIRMATION_RECEIVED",
            origin: "EXTERNAL_SUBMISSION",
            occurredAt: at.at,
            timeZone: at.timeZone,
            summary: input.confirmationText,
            idempotencyKey: `${key}:confirmation`,
            attachments: { create: attachmentRows(workspaceId, prepared.files) },
          },
        });
      }
    });
  } catch (error) {
    await discardStored(prepared.files);
    // A second click racing the first waits on the row, then finds it
    // recorded: if it was this same save, that is a replay, not a refusal.
    if (error instanceof AbortTx || isUniqueViolation(error)) {
      const first = await db.applicationEvent.findFirst({ where: { idempotencyKey: key, workspaceId }, select: { id: true } });
      if (first) return { ok: true, replay: true };
      if (error instanceof AbortTx) return error.failure;
    }
    throw error;
  }

  await recordAuditEvent(workspaceId, "application.submission_recorded", {
    applicationId,
    targetJobId: app.targetJobId,
    channel: input.channel,
    attachments: prepared.files.length,
  });
  if (before !== after) {
    await recordAuditEvent(workspaceId, "application.status_changed", {
      applicationId,
      targetJobId: app.targetJobId,
      fromStatus: before,
      toStatus: after,
    });
  }
  return { ok: true, replay: false };
}

/**
 * "Edit recorded details". Never moves a later status back: only a Saved
 * application becomes Applied again (the candidate is saying they applied).
 * The follow-up date and the confirmation are edited elsewhere.
 */
export async function editExternalSubmission(
  workspaceId: string,
  applicationId: string,
  input: EditSubmissionInput,
): Promise<{ ok: true } | TimelineFailure> {
  const db = getJobmatchDb();
  const app = await db.application.findFirst({
    where: { id: applicationId, workspaceId },
    select: {
      id: true,
      targetJobId: true,
      status: true,
      appliedAt: true,
      appliedTimeZone: true,
      submissionChannel: true,
      submissionChannelLabel: true,
      applicationUrl: true,
      submissionReference: true,
      events: { where: { origin: "EXTERNAL_SUBMISSION", kind: "SUBMITTED" }, select: { id: true, summary: true }, take: 1 },
    },
  });
  if (!app) return { ok: false, reason: "not_found" };
  if (!app.submissionChannel) return { ok: false, reason: "not_recorded" };

  const before = app.status as ApplicationStatusName;
  const after = statusAfterSubmission(before);
  const label = input.channel === "OTHER" ? input.channelLabel : null;
  const changed: string[] = [];
  if (app.appliedAt?.getTime() !== input.appliedAt.at.getTime() || app.appliedTimeZone !== input.appliedAt.timeZone) changed.push("appliedAt");
  if (app.submissionChannel !== input.channel || app.submissionChannelLabel !== label) changed.push("channel");
  if (app.applicationUrl !== input.applicationUrl) changed.push("applicationUrl");
  if (app.submissionReference !== input.reference) changed.push("reference");
  const event = app.events[0] ?? null;
  if ((event?.summary ?? null) !== input.notes) changed.push("notes");
  if (changed.length === 0 && before === after) return { ok: true };

  await db.$transaction(async (tx) => {
    await tx.application.updateMany({
      where: { id: applicationId, workspaceId },
      data: {
        status: after as ApplicationStatus,
        appliedAt: input.appliedAt.at,
        appliedTimeZone: input.appliedAt.timeZone,
        submissionChannel: input.channel,
        submissionChannelLabel: label,
        applicationUrl: input.applicationUrl,
        submissionReference: input.reference,
      },
    });
    if (event) {
      await tx.applicationEvent.updateMany({
        where: { id: event.id, workspaceId },
        data: { occurredAt: input.appliedAt.at, timeZone: input.appliedAt.timeZone, summary: input.notes },
      });
    } else {
      await tx.applicationEvent.create({
        data: {
          workspaceId,
          applicationId,
          kind: "SUBMITTED",
          origin: "EXTERNAL_SUBMISSION",
          occurredAt: input.appliedAt.at,
          timeZone: input.appliedAt.timeZone,
          summary: input.notes,
          idempotencyKey: `${workspaceId}:edit-${randomUUID()}`,
        },
      });
    }
  });

  await recordAuditEvent(workspaceId, "application.submission_edited", {
    applicationId,
    targetJobId: app.targetJobId,
    changedFields: changed.join(","),
  });
  if (before !== after) {
    await recordAuditEvent(workspaceId, "application.status_changed", { applicationId, targetJobId: app.targetJobId, fromStatus: before, toStatus: after });
  }
  return { ok: true };
}

/**
 * Undo an external submission recorded by mistake. Removes the submission
 * details and the entries recorded with it (their attachments too), and
 * nothing else: the job, CVs, letters, sent emails and every other entry
 * stay.
 *
 * Status: an Applied application goes back to Saved, unless an accepted
 * ResuMatch email still says it was sent (then it stays Applied, dated by
 * that email). A later status (Interviewing, Offer, Rejected) stays.
 */
export async function undoExternalSubmission(
  workspaceId: string,
  applicationId: string,
): Promise<{ ok: true; status: ApplicationStatusName } | TimelineFailure> {
  const db = getJobmatchDb();
  const app = await db.application.findFirst({
    where: { id: applicationId, workspaceId },
    select: {
      id: true,
      targetJobId: true,
      status: true,
      appliedAt: true,
      submissionChannel: true,
      events: {
        where: { origin: "EXTERNAL_SUBMISSION" },
        select: { id: true, attachments: { select: { id: true, storageKey: true } } },
      },
    },
  });
  if (!app) return { ok: false, reason: "not_found" };
  if (!app.submissionChannel) return { ok: false, reason: "not_recorded" };

  const failed = await removeAttachments(workspaceId, app.events.flatMap((e) => e.attachments));
  if (failed > 0) return { ok: false, reason: "storage" };

  const accepted = await db.sentApplicationEmail.findFirst({
    where: { workspaceId, applicationId, status: "ACCEPTED" },
    orderBy: [{ sentAt: "asc" }, { attemptedAt: "asc" }],
    select: { sentAt: true, attemptedAt: true },
  });
  const before = app.status as ApplicationStatusName;
  let after = before;
  let appliedAt: Date | null = app.appliedAt;
  if (before === "APPLIED") {
    if (accepted) appliedAt = accepted.sentAt ?? accepted.attemptedAt;
    else {
      after = "SAVED";
      appliedAt = null;
    }
  } else if (before === "SAVED") {
    appliedAt = null;
  } else if (accepted) {
    appliedAt = accepted.sentAt ?? accepted.attemptedAt;
  }

  await db.$transaction(async (tx) => {
    await tx.applicationEvent.deleteMany({ where: { workspaceId, applicationId, origin: "EXTERNAL_SUBMISSION" } });
    await tx.application.updateMany({
      where: { id: applicationId, workspaceId },
      data: {
        status: after as ApplicationStatus,
        appliedAt,
        appliedTimeZone: null,
        submissionChannel: null,
        submissionChannelLabel: null,
        applicationUrl: null,
        submissionReference: null,
        submissionRecordedAt: null,
      },
    });
  });

  await recordAuditEvent(workspaceId, "application.submission_undone", { applicationId, targetJobId: app.targetJobId });
  if (before !== after) {
    await recordAuditEvent(workspaceId, "application.status_changed", { applicationId, targetJobId: app.targetJobId, fromStatus: before, toStatus: after });
  }
  return { ok: true, status: after };
}

// ─── Timeline entries ───────────────────────────────────────────────────

export type CreateEventResult = { ok: true; eventId: string; replay: boolean } | TimelineFailure;

/** "Add update". Status changes only when `statusChange` names a status
 *  other than the current one. */
export async function createEvent(
  workspaceId: string,
  applicationId: string,
  input: CreateEventInput,
  files: IncomingFile[] = [],
): Promise<CreateEventResult> {
  const db = getJobmatchDb();
  const key = `${workspaceId}:${input.clientKey}`;
  const replay = await db.applicationEvent.findFirst({ where: { idempotencyKey: key, workspaceId, applicationId }, select: { id: true } });
  if (replay) return { ok: true, eventId: replay.id, replay: true };

  const app = await findApplication(workspaceId, applicationId);
  if (!app) return { ok: false, reason: "not_found" };

  const prepared = await prepareFiles(workspaceId, files);
  if (!prepared.ok) return prepared;

  let statusEvent: { from: ApplicationStatusName; to: ApplicationStatusName } | null = null;
  let eventId = "";
  try {
    eventId = await db.$transaction(async (tx) => {
      // Read inside the transaction, so the recorded "from" is the status
      // this change actually replaced.
      const current = await tx.application.findFirst({ where: { id: applicationId, workspaceId }, select: { status: true, appliedAt: true } });
      if (!current) throw new AbortTx({ ok: false, reason: "not_found" });
      const before = current.status as ApplicationStatusName;
      const to = input.statusChange && input.statusChange !== before ? input.statusChange : null;
      const data: Prisma.ApplicationUpdateManyMutationInput = {};
      if (to) {
        statusEvent = { from: before, to };
        data.status = to as ApplicationStatus;
        const at = input.kind === "SUBMITTED" ? input.occurredAt.at : new Date();
        const appliedAt = appliedAtForStatusChange(before, to, current.appliedAt, at);
        if (appliedAt !== undefined) data.appliedAt = appliedAt;
        if (appliedAt instanceof Date && input.kind === "SUBMITTED") data.appliedTimeZone = input.occurredAt.timeZone;
        if (appliedAt === null) data.appliedTimeZone = null;
      }
      if (input.followUpDate) data.followUpDate = input.followUpDate;
      if (Object.keys(data).length > 0) await tx.application.updateMany({ where: { id: applicationId, workspaceId }, data });

      const created = await tx.applicationEvent.create({
        data: {
          workspaceId,
          applicationId,
          kind: input.kind,
          origin: "MANUAL",
          occurredAt: input.occurredAt.at,
          timeZone: input.occurredAt.timeZone,
          summary: input.summary,
          sender: input.sender,
          recipient: input.recipient,
          nextAction: input.nextAction,
          followUpDate: input.followUpDate,
          fromStatus: to ? (before as ApplicationStatus) : null,
          toStatus: to ? (to as ApplicationStatus) : null,
          idempotencyKey: key,
          attachments: { create: attachmentRows(workspaceId, prepared.files) },
        },
        select: { id: true },
      });
      return created.id;
    });
  } catch (error) {
    await discardStored(prepared.files);
    if (error instanceof AbortTx) return error.failure;
    if (isUniqueViolation(error)) {
      const existing = await db.applicationEvent.findFirst({ where: { idempotencyKey: key, workspaceId }, select: { id: true } });
      if (existing) return { ok: true, eventId: existing.id, replay: true };
    }
    throw error;
  }

  await recordAuditEvent(workspaceId, "application.event_added", {
    applicationId,
    targetJobId: app.targetJobId,
    kind: input.kind,
    attachments: prepared.files.length,
  });
  const change = statusEvent as { from: ApplicationStatusName; to: ApplicationStatusName } | null;
  if (change) {
    await recordAuditEvent(workspaceId, "application.status_changed", {
      applicationId,
      targetJobId: app.targetJobId,
      fromStatus: change.from,
      toStatus: change.to,
    });
  }
  return { ok: true, eventId, replay: false };
}

async function findEvent(workspaceId: string, applicationId: string, eventId: string) {
  return getJobmatchDb().applicationEvent.findFirst({
    where: { id: eventId, applicationId, workspaceId },
    select: {
      id: true,
      kind: true,
      origin: true,
      followUpDate: true,
      attachments: { select: { id: true, storageKey: true } },
    },
  });
}

const isRecordedSubmission = (event: { kind: string; origin: string }) => event.kind === "SUBMITTED" && event.origin === "EXTERNAL_SUBMISSION";

/** Corrects an entry. The status change it made is history and stays as
 *  recorded; a new follow-up date is also set on the application. */
export async function updateEvent(
  workspaceId: string,
  applicationId: string,
  eventId: string,
  input: UpdateEventInput,
): Promise<{ ok: true } | TimelineFailure> {
  const db = getJobmatchDb();
  const event = await findEvent(workspaceId, applicationId, eventId);
  if (!event) return { ok: false, reason: "not_found" };
  if (isRecordedSubmission(event) || (input.kind === "SUBMITTED" && event.origin === "EXTERNAL_SUBMISSION")) {
    return { ok: false, reason: "recorded_submission" };
  }

  const followUpChanged = input.followUpDate !== null && input.followUpDate.getTime() !== event.followUpDate?.getTime();
  await db.$transaction(async (tx) => {
    await tx.applicationEvent.updateMany({
      where: { id: eventId, applicationId, workspaceId },
      data: {
        kind: input.kind,
        occurredAt: input.occurredAt.at,
        timeZone: input.occurredAt.timeZone,
        summary: input.summary,
        sender: input.sender,
        recipient: input.recipient,
        nextAction: input.nextAction,
        followUpDate: input.followUpDate,
      },
    });
    if (followUpChanged) {
      await tx.application.updateMany({ where: { id: applicationId, workspaceId }, data: { followUpDate: input.followUpDate } });
    }
  });
  await recordAuditEvent(workspaceId, "application.event_edited", { applicationId, kind: input.kind });
  return { ok: true };
}

/** Deletes an entry and its attachments. The status it may have changed
 *  stays: status is corrected with the stepper. */
export async function deleteEvent(workspaceId: string, applicationId: string, eventId: string): Promise<{ ok: true } | TimelineFailure> {
  const event = await findEvent(workspaceId, applicationId, eventId);
  if (!event) return { ok: false, reason: "not_found" };
  if (isRecordedSubmission(event)) return { ok: false, reason: "recorded_submission" };
  const failed = await removeAttachments(workspaceId, event.attachments);
  if (failed > 0) return { ok: false, reason: "storage" };
  await getJobmatchDb().applicationEvent.deleteMany({ where: { id: eventId, applicationId, workspaceId } });
  await recordAuditEvent(workspaceId, "application.event_deleted", { applicationId, kind: event.kind });
  return { ok: true };
}

/** Adds files to an existing entry. A file already on it is not added twice. */
export async function addAttachments(
  workspaceId: string,
  applicationId: string,
  eventId: string,
  files: IncomingFile[],
): Promise<{ ok: true; added: number } | TimelineFailure> {
  const db = getJobmatchDb();
  const event = await db.applicationEvent.findFirst({
    where: { id: eventId, applicationId, workspaceId },
    select: { id: true, attachments: { select: { contentHash: true } } },
  });
  if (!event) return { ok: false, reason: "not_found" };
  const existing = new Set(event.attachments.map((a) => a.contentHash));
  const fresh = files.filter((f) => !existing.has(hashBytes(f.bytes)));
  if (fresh.length === 0) return { ok: true, added: 0 };
  if (event.attachments.length + fresh.length > MAX_ATTACHMENTS_PER_EVENT) return { ok: false, reason: "files", problem: "TOO_MANY_FILES" };

  const prepared = await prepareFiles(workspaceId, fresh, event.attachments.length);
  if (!prepared.ok) return prepared;
  let added = 0;
  for (const row of attachmentRows(workspaceId, prepared.files)) {
    try {
      await db.applicationEventAttachment.create({ data: { ...row, eventId } });
      added += 1;
    } catch (error) {
      // The same file added from two tabs at once: keep the first.
      await discardStored([row]);
      if (!isUniqueViolation(error)) throw error;
    }
  }
  if (added > 0) await recordAuditEvent(workspaceId, "application.attachment_added", { applicationId, attachments: added });
  return { ok: true, added };
}

export async function deleteAttachment(workspaceId: string, attachmentId: string): Promise<{ ok: true } | TimelineFailure> {
  const db = getJobmatchDb();
  const attachment = await db.applicationEventAttachment.findFirst({
    where: { id: attachmentId, workspaceId },
    select: { id: true, storageKey: true, event: { select: { applicationId: true } } },
  });
  if (!attachment) return { ok: false, reason: "not_found" };
  const failed = await removeAttachments(workspaceId, [attachment]);
  if (failed > 0) return { ok: false, reason: "storage" };
  await recordAuditEvent(workspaceId, "application.attachment_deleted", { applicationId: attachment.event.applicationId });
  return { ok: true };
}

/** One attachment's bytes, for its owner only, checked against the hash
 *  recorded at upload. */
export async function readAttachment(workspaceId: string, attachmentId: string) {
  const db = getJobmatchDb();
  const row = await db.applicationEventAttachment.findFirst({
    where: { id: attachmentId, workspaceId },
    select: { id: true, kind: true, contentType: true, filename: true, storageKey: true, contentHash: true },
  });
  if (!row) return { ok: false as const, reason: "not_found" as const };
  const object = await readDocumentBytes(row.storageKey);
  if (!object || hashBytes(object.bytes) !== row.contentHash) return { ok: false as const, reason: "unreadable" as const };
  return { ok: true as const, row, bytes: object.bytes };
}

// ─── Reading the timeline ───────────────────────────────────────────────

export interface TimelinePage {
  application: {
    id: string;
    status: ApplicationStatusName;
    jobTitle: string | null;
    employer: string | null;
    appliedAt: string | null;
    appliedTimeZone: string | null;
    followUpDay: string | null;
    submission: {
      channel: "INDEED" | "LINKEDIN" | "COMPANY_WEBSITE" | "OTHER";
      channelLabel: string | null;
      applicationUrl: string | null;
      reference: string | null;
      recordedAt: string | null;
    } | null;
  };
  entries: TimelineEntryView[];
}

export async function loadTimeline(workspaceId: string, applicationId: string): Promise<TimelinePage | null> {
  const db = getJobmatchDb();
  const app = await db.application.findFirst({
    where: { id: applicationId, workspaceId },
    include: {
      targetJob: { select: { title: true, employer: true } },
      events: {
        orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
        include: { attachments: { orderBy: { createdAt: "asc" } } },
      },
      sentEmails: {
        orderBy: [{ attemptedAt: "asc" }],
        select: { id: true, status: true, attemptedAt: true, sentAt: true, contactEmail: true, additionalRecipients: true, subject: true, statusTransition: true },
      },
    },
  });
  if (!app) return null;

  const events: EventEntryView[] = app.events.map((e) => ({
    type: "event",
    id: e.id,
    kind: e.kind as EventKindName,
    origin: e.origin,
    occurredAt: e.occurredAt.toISOString(),
    timeZone: e.timeZone,
    summary: e.summary,
    sender: e.sender,
    recipient: e.recipient,
    nextAction: e.nextAction,
    followUpDay: followUpDateToDay(e.followUpDate),
    fromStatus: (e.fromStatus as ApplicationStatusName | null) ?? null,
    toStatus: (e.toStatus as ApplicationStatusName | null) ?? null,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    isRecordedSubmission: isRecordedSubmission(e),
    attachments: e.attachments.map(
      (a): AttachmentView => ({
        id: a.id,
        kind: a.kind,
        contentType: a.contentType,
        filename: a.filename,
        byteSize: a.byteSize,
        createdAt: a.createdAt.toISOString(),
        emailPreview: a.kind === "EMAIL" ? readEmailPreview(a.emailPreview) : null,
      }),
    ),
  }));
  const emails: EmailEntryView[] = app.sentEmails.map((s) => ({
    type: "email",
    id: s.id,
    status: s.status,
    at: (s.sentAt ?? s.attemptedAt).toISOString(),
    to: recipientSummary(s.contactEmail, s.additionalRecipients),
    subject: s.subject,
    statusTransition: s.statusTransition,
  }));

  return {
    application: {
      id: app.id,
      status: app.status as ApplicationStatusName,
      jobTitle: app.targetJob.title,
      employer: app.targetJob.employer,
      appliedAt: app.appliedAt?.toISOString() ?? null,
      appliedTimeZone: app.appliedTimeZone,
      followUpDay: followUpDateToDay(app.followUpDate),
      submission: app.submissionChannel
        ? {
            channel: app.submissionChannel,
            channelLabel: app.submissionChannelLabel,
            applicationUrl: app.applicationUrl,
            reference: app.submissionReference,
            recordedAt: app.submissionRecordedAt?.toISOString() ?? null,
          }
        : null,
    },
    entries: mergeTimeline(events, emails),
  };
}

/** Everything the external-submission form needs to open, prefilled. */
export async function loadSubmissionForm(workspaceId: string, applicationId: string) {
  const db = getJobmatchDb();
  const app = await db.application.findFirst({
    where: { id: applicationId, workspaceId },
    select: {
      id: true,
      status: true,
      appliedAt: true,
      appliedTimeZone: true,
      followUpDate: true,
      submissionChannel: true,
      submissionChannelLabel: true,
      applicationUrl: true,
      submissionReference: true,
      targetJob: { select: { title: true, employer: true, sourceUrl: true } },
      events: { where: { origin: "EXTERNAL_SUBMISSION", kind: "SUBMITTED" }, select: { summary: true }, take: 1 },
      _count: { select: { sentEmails: { where: { status: "ACCEPTED" } } } },
    },
  });
  return app;
}
