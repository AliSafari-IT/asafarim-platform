import { NextResponse } from "next/server";
import { auth } from "@asafarim/auth";
import { createTransport } from "@asafarim/auth/mailer";
import { prisma } from "@asafarim/db";
import { buildKey, putObjectBytes } from "@asafarim/storage";
import { site } from "../../../content/site";
import {
  MAX_TOTAL_BYTES,
  MAX_FILES,
  MAX_HTML_LENGTH,
  isAllowedFile,
  contentTypeFor,
  extOf,
} from "../../contact/constants";
import { ContactRateLimiter } from "../../contact/spam";
import { buildNotification, headerLine } from "../../../lib/contact/email";
import {
  checkFileContent,
  sanitizeFileName,
} from "../../../lib/contact/file-check";
import { createScanner } from "../../../lib/contact/scanner";

export const runtime = "nodejs";

/** Strip tags to a plain-text approximation for previews + the email fallback. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Signed-in senders: 5 messages per user per 10 minutes. */
const limiter = new ContactRateLimiter(5, 10 * 60 * 1000);
const scanner = createScanner();

/** A security event for the logs: who, which file, why. Never the file's bytes. */
function logRejected(
  userId: string,
  fileName: string,
  reason: string,
  extra: Record<string, unknown> = {}
) {
  console.warn(
    JSON.stringify({
      app: "web",
      level: "warn",
      msg: "contact.attachment.rejected",
      userId,
      fileName,
      reason,
      ...extra,
    })
  );
}

/**
 * Authenticated contact submission: persists a tracked ContactMessage with its
 * attachments (stored privately in object storage) and emails the site owner.
 * Anonymous visitors use the plain server-action form instead.
 *
 * Attachments are untrusted. Before anything is stored or sent: the sender's account must
 * be active in the database (not just in an old session token), each file's bytes must
 * match its type and carry no active content, and the antivirus must call it clean. A
 * file that fails or cannot be scanned rejects the whole message; nothing is stored.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Sign in to send a tracked message." },
      { status: 401 }
    );
  }
  const userId = session.user.id;

  // The session token can be days old: ask the database whether the account is active now.
  const account = await prisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true },
  });
  if (!account?.isActive) {
    return NextResponse.json(
      { error: "Your account is not active, so messages can't be sent." },
      { status: 403 }
    );
  }
  if (!limiter.allow(userId)) {
    return NextResponse.json(
      { error: "Too many messages. Please wait a few minutes." },
      { status: 429 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data." },
      { status: 400 }
    );
  }

  const subject = headerLine(String(form.get("subject") ?? "").trim(), 200);
  const bodyHtml = String(form.get("bodyHtml") ?? "").trim();

  if (!bodyHtml) {
    return NextResponse.json(
      { error: "Please add some message content." },
      { status: 400 }
    );
  }
  if (bodyHtml.length > MAX_HTML_LENGTH) {
    return NextResponse.json(
      { error: "Message content is too large." },
      { status: 400 }
    );
  }

  const files = form
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Too many files (max ${MAX_FILES}).` },
      { status: 400 }
    );
  }

  let totalBytes = 0;
  for (const file of files) {
    if (!isAllowedFile(file.name)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${sanitizeFileName(file.name)}` },
        { status: 415 }
      );
    }
    totalBytes += file.size;
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    return NextResponse.json(
      { error: "Attachments exceed the 50 MB total limit." },
      { status: 413 }
    );
  }

  const name = headerLine(
    session.user.name?.trim() || session.user.email || "Unknown",
    120
  );
  const email = headerLine(session.user.email ?? "", 200);
  const bodyText = htmlToText(bodyHtml);

  // 1. Check and scan every file before storing or sending any of them.
  const verified: {
    fileName: string;
    contentType: string;
    sizeBytes: number;
    ext: string;
    buffer: Buffer;
  }[] = [];
  for (const file of files) {
    const fileName = sanitizeFileName(file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    const content = checkFileContent(fileName, buffer);
    if (!content.ok) {
      logRejected(userId, fileName, content.reason);
      return NextResponse.json(
        {
          error: `"${fileName}" was not accepted: ${content.reason}. Nothing was sent.`,
        },
        { status: 422 }
      );
    }
    const verdict = await scanner.scan(buffer);
    if (verdict.outcome === "infected") {
      logRejected(userId, fileName, "malware", {
        signature: verdict.signature,
        scanner: verdict.scanner,
      });
      return NextResponse.json(
        {
          error: `"${fileName}" was blocked by the virus scanner. Nothing was sent.`,
        },
        { status: 422 }
      );
    }
    if (verdict.outcome === "unavailable") {
      logRejected(userId, fileName, "scanner-unavailable", {
        detail: verdict.detail,
        scanner: verdict.scanner,
      });
      return NextResponse.json(
        {
          error:
            "Attachments can't be checked right now, so they are not accepted. Please try again later, or send the message without files.",
        },
        { status: 503 }
      );
    }
    verified.push({
      fileName,
      contentType: contentTypeFor(fileName, file.type),
      sizeBytes: buffer.length,
      ext: extOf(fileName),
      buffer,
    });
  }

  // 2. Store the verified files (private ACL, served only through the download route).
  const stored: ((typeof verified)[number] & { storageKey: string })[] = [];
  try {
    for (const file of verified) {
      const key = buildKey(`contact/${userId}`, file.ext || "bin");
      await putObjectBytes(key, file.buffer, file.contentType, {
        acl: "private",
      });
      stored.push({ ...file, storageKey: key });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "upload failed";
    return NextResponse.json(
      { error: `Could not store attachments: ${message}` },
      { status: 500 }
    );
  }

  const created = await prisma.contactMessage.create({
    data: {
      userId,
      name,
      email,
      subject: subject || null,
      bodyHtml,
      bodyText,
      status: "sent",
      attachments: {
        create: stored.map((s) => ({
          fileName: s.fileName,
          contentType: s.contentType,
          sizeBytes: s.sizeBytes,
          storageKey: s.storageKey,
        })),
      },
    },
    include: { attachments: true },
  });

  // 3. Notify the site owner. The text is escaped and plain; the files stay in the inbox
  // unless CONTACT_EMAIL_ATTACH=true (they have been scanned, but a mailbox is the one place
  // a scanner miss would land on a person).
  let emailSent = false;
  try {
    const { transporter, from, bcc } = await createTransport();
    const attach = process.env.CONTACT_EMAIL_ATTACH === "true";
    const { text, html } = buildNotification({
      name,
      email,
      bodyText,
      files: stored.map((s) => ({
        fileName: s.fileName,
        sizeBytes: s.sizeBytes,
      })),
      attached: attach,
    });
    await transporter.sendMail({
      from,
      to: site.contact.email,
      replyTo: email,
      bcc,
      subject: subject ? `Contact: ${subject}` : `Contact message from ${name}`,
      text,
      html,
      attachments: attach
        ? stored.map((s) => ({
            filename: s.fileName,
            content: s.buffer,
            contentType: s.contentType,
          }))
        : undefined,
    });
    emailSent = true;
  } catch {
    // Delivery is best-effort — the message is already safely in the inbox.
  }

  if (emailSent) {
    await prisma.contactMessage.update({
      where: { id: created.id },
      data: { emailSent: true },
    });
  }

  return NextResponse.json({
    message: {
      id: created.id,
      subject: created.subject,
      bodyHtml: created.bodyHtml,
      bodyText: created.bodyText,
      status: created.status,
      emailSent,
      createdAt: created.createdAt.toISOString(),
      attachments: created.attachments.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        contentType: a.contentType,
        sizeBytes: a.sizeBytes,
      })),
    },
  });
}
