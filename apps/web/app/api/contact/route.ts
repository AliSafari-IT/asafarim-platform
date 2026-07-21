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
  EMAIL_ATTACH_CAP_BYTES,
  isAllowedFile,
  contentTypeFor,
  extOf,
} from "../../contact/constants";

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

/**
 * Authenticated contact submission: persists a tracked ContactMessage with its
 * attachments (stored privately in object storage) and emails the site owner.
 * Anonymous visitors use the plain server-action form instead.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to send a tracked message." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const subject = String(form.get("subject") ?? "").trim().slice(0, 200);
  const bodyHtml = String(form.get("bodyHtml") ?? "").trim();

  if (!bodyHtml) {
    return NextResponse.json({ error: "Please add some message content." }, { status: 400 });
  }
  if (bodyHtml.length > MAX_HTML_LENGTH) {
    return NextResponse.json({ error: "Message content is too large." }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Too many files (max ${MAX_FILES}).` }, { status: 400 });
  }

  let totalBytes = 0;
  for (const file of files) {
    if (!isAllowedFile(file.name)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.name}` },
        { status: 415 },
      );
    }
    totalBytes += file.size;
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    return NextResponse.json(
      { error: "Attachments exceed the 50 MB total limit." },
      { status: 413 },
    );
  }

  const name = session.user.name?.trim() || session.user.email || "Unknown";
  const email = session.user.email ?? "";
  const bodyText = htmlToText(bodyHtml);

  // Read + upload the attachments (private ACL — served only via the download route).
  const stored: {
    fileName: string;
    contentType: string;
    sizeBytes: number;
    storageKey: string;
    buffer: Buffer;
  }[] = [];
  try {
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const contentType = contentTypeFor(file.name, file.type);
      const key = buildKey(`contact/${session.user.id}`, extOf(file.name) || "bin");
      await putObjectBytes(key, buffer, contentType, { acl: "private" });
      stored.push({
        fileName: file.name.slice(0, 255),
        contentType,
        sizeBytes: file.size,
        storageKey: key,
        buffer,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "upload failed";
    return NextResponse.json({ error: `Could not store attachments: ${message}` }, { status: 500 });
  }

  const created = await prisma.contactMessage.create({
    data: {
      userId: session.user.id,
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

  // Notify the site owner. Attach files when they fit under the provider cap;
  // otherwise note that they are available in the sender's inbox.
  let emailSent = false;
  try {
    const { transporter, from, bcc } = createTransport();
    const withinCap = totalBytes <= EMAIL_ATTACH_CAP_BYTES;
    await transporter.sendMail({
      from,
      to: site.contact.email,
      replyTo: email,
      bcc,
      subject: subject ? `Contact: ${subject}` : `Contact message from ${name}`,
      text:
        `Name: ${name}\nEmail: ${email}\n\n${bodyText}\n\n` +
        (stored.length
          ? `Attachments (${stored.length}):\n` +
            stored.map((s) => `- ${s.fileName} (${s.sizeBytes} bytes)`).join("\n") +
            (withinCap ? "" : "\n\n(Attachments are stored in the sender's inbox.)")
          : ""),
      html:
        `<p><strong>Name:</strong> ${name}</p>` +
        `<p><strong>Email:</strong> ${email}</p><hr />` +
        bodyHtml +
        (stored.length
          ? `<hr /><p><strong>Attachments (${stored.length}):</strong></p><ul>` +
            stored.map((s) => `<li>${s.fileName} — ${s.sizeBytes} bytes</li>`).join("") +
            `</ul>` +
            (withinCap ? "" : `<p><em>Attachments are available in the sender's inbox.</em></p>`)
          : ""),
      attachments: withinCap
        ? stored.map((s) => ({ filename: s.fileName, content: s.buffer, contentType: s.contentType }))
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
