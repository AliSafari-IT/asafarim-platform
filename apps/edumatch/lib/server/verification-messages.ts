/**
 * Two-way verification message thread between admins and a tutor.
 *
 * The thread is keyed by `tutorId` (the verification subject). Each message
 * records whether it came from an ADMIN or the TUTOR. Posting a message
 * notifies the opposite party (in-app + best-effort email) and emits an audit
 * event. `readAt` is stamped when the recipient opens the thread, powering
 * unread badges on both sides.
 */

import { prisma, Prisma } from "@asafarim/db";
import { recordEduAuditEvent } from "./audit";
import { notifyVerificationMessage } from "./notifications";
import {
  isKeyOwnedBy,
  signAttachments,
  type AttachmentView,
} from "./storage";

export type ThreadRole = "ADMIN" | "TUTOR";

export type StoredAttachment = {
  key: string;
  mime: string;
  filename: string;
  sizeBytes: number;
};

export const SUPPORTED_EMOJIS = [
  "thumbsup",
  "thumbsdown",
  "check",
  "question",
  "eyes",
  "tada",
  "heart",
  "fire",
  "rocket",
  "taco",
  "star",
  "tart",
] as const;
export type SupportedEmoji = (typeof SUPPORTED_EMOJIS)[number];

export type MessageReactions = Partial<Record<SupportedEmoji, string[]>>;

export type VerificationMessageView = {
  id: string;
  senderRole: ThreadRole;
  senderId: string;
  senderName: string | null;
  body: string;
  attachments: AttachmentView[];
  reactions: MessageReactions;
  readAt: string | null;
  createdAt: string;
};

const MAX_BODY = 4000;
const MAX_ATTACHMENTS = 5;

function normalizeBody(raw: unknown, hasAttachments: boolean): string {
  const body = typeof raw === "string" ? raw.trim() : "";
  if (!body && !hasAttachments) {
    throw new Error("Message body is required.");
  }
  if (body.length > MAX_BODY) {
    throw new Error(`Message must be ${MAX_BODY} characters or fewer.`);
  }
  return body;
}

function sanitizeAttachments(
  raw: unknown,
  senderId: string,
): StoredAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredAttachment[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const a = item as Record<string, unknown>;
    if (
      typeof a.key === "string" &&
      typeof a.mime === "string" &&
      typeof a.filename === "string" &&
      typeof a.sizeBytes === "number" &&
      isKeyOwnedBy(a.key, senderId)
    ) {
      out.push({
        key: a.key,
        mime: a.mime,
        filename: a.filename,
        sizeBytes: a.sizeBytes,
      });
    }
    if (out.length >= MAX_ATTACHMENTS) break;
  }
  return out;
}

export async function postVerificationMessage(input: {
  tutorId: string;
  senderId: string;
  senderRole: ThreadRole;
  body: string;
  attachments?: unknown;
}): Promise<{ id: string }> {
  const attachments = sanitizeAttachments(input.attachments, input.senderId);
  const body = normalizeBody(input.body, attachments.length > 0);

  const row = await prisma.eduVerificationMessage.create({
    data: {
      tutorId: input.tutorId,
      senderId: input.senderId,
      senderRole: input.senderRole,
      body,
      attachments:
        attachments.length > 0
          ? (attachments as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
    },
    select: { id: true },
  });

  const previewBase =
    body || (attachments.length > 0 ? `Attachment: ${attachments[0].filename}` : "");
  const preview =
    previewBase.length > 140 ? `${previewBase.slice(0, 137)}...` : previewBase;

  if (input.senderRole === "ADMIN") {
    await notifyVerificationMessage({ recipientId: input.tutorId, preview });
  } else {
    const lastReview = await prisma.eduTutorVerification.findFirst({
      where: { tutorId: input.tutorId, reviewerId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { reviewerId: true },
    });
    if (lastReview?.reviewerId) {
      await notifyVerificationMessage({
        recipientId: lastReview.reviewerId,
        preview,
        forAdmin: true,
        tutorId: input.tutorId,
      });
    }
  }

  await recordEduAuditEvent({
    actorId: input.senderId,
    actorRole: input.senderRole,
    action: "TUTOR_VERIFICATION_MESSAGE_SENT",
    entity: "EduVerificationMessage",
    entityId: row.id,
    metadata: { tutorId: input.tutorId, senderRole: input.senderRole },
  });

  return row;
}

export async function listVerificationThread(
  tutorId: string,
): Promise<VerificationMessageView[]> {
  const rows = await prisma.eduVerificationMessage.findMany({
    where: { tutorId },
    orderBy: { createdAt: "asc" },
    include: { sender: { select: { name: true } } },
  });
  return Promise.all(
    rows.map(async (m) => ({
      id: m.id,
      senderRole: m.senderRole as ThreadRole,
      senderId: m.senderId,
      senderName: m.sender?.name ?? null,
      body: m.body,
      attachments: await signAttachments(m.attachments),
      reactions: parseReactions(m.reactions),
      readAt: m.readAt ? m.readAt.toISOString() : null,
      createdAt: m.createdAt.toISOString(),
    })),
  );
}

export async function markThreadRead(
  tutorId: string,
  readerRole: ThreadRole,
): Promise<number> {
  const otherRole: ThreadRole = readerRole === "ADMIN" ? "TUTOR" : "ADMIN";
  const result = await prisma.eduVerificationMessage.updateMany({
    where: { tutorId, senderRole: otherRole, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}

export async function countUnreadForTutor(tutorId: string): Promise<number> {
  return prisma.eduVerificationMessage.count({
    where: { tutorId, senderRole: "ADMIN", readAt: null },
  });
}

export async function countUnreadForAdmin(tutorId: string): Promise<number> {
  return prisma.eduVerificationMessage.count({
    where: { tutorId, senderRole: "TUTOR", readAt: null },
  });
}

function parseReactions(raw: unknown): MessageReactions {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: MessageReactions = {};
  for (const emoji of SUPPORTED_EMOJIS) {
    const val = (raw as Record<string, unknown>)[emoji];
    if (Array.isArray(val)) {
      result[emoji] = val.filter((v): v is string => typeof v === "string");
    }
  }
  return result;
}

export async function toggleReaction(
  messageId: string,
  userId: string,
  emoji: SupportedEmoji,
): Promise<MessageReactions> {
  const msg = await prisma.eduVerificationMessage.findUniqueOrThrow({
    where: { id: messageId },
    select: { reactions: true },
  });

  const reactions = parseReactions(msg.reactions);
  const current = reactions[emoji] ?? [];
  const alreadyReacted = current.includes(userId);

  if (alreadyReacted) {
    const updated = current.filter((id) => id !== userId);
    if (updated.length === 0) {
      delete reactions[emoji];
    } else {
      reactions[emoji] = updated;
    }
  } else {
    reactions[emoji] = [...current, userId];
  }

  await prisma.eduVerificationMessage.update({
    where: { id: messageId },
    data: { reactions: reactions as unknown as Prisma.InputJsonValue },
  });

  return reactions;
}
