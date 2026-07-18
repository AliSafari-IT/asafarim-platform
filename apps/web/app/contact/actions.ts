"use server";

import { createTransport } from "@asafarim/auth/mailer";
import { site } from "../../content/site";

export type ContactFormState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function validateContact(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!name || name.length > 100) {
    return { ok: false, error: "Please enter your name (max 100 characters)." } as const;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return { ok: false, error: "Please enter a valid email address." } as const;
  }
  if (!message || message.length < 10 || message.length > 5000) {
    return { ok: false, error: "Please write a project description (10–5000 characters)." } as const;
  }
  return { ok: true, data: { name, email, message } } as const;
}

export async function sendContactMessage(
  _prevState: ContactFormState,
  formData: FormData
): Promise<ContactFormState> {
  const validation = validateContact(formData);
  if (!validation.ok) {
    return { status: "error", message: validation.error };
  }

  const { name, email, message } = validation.data;

  try {
    const { transporter, from, bcc } = createTransport();
    await transporter.sendMail({
      from,
      to: site.contact.email,
      replyTo: email,
      bcc,
      subject: `Project inquiry from ${name}`,
      text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
      html: [
        `<p><strong>Name:</strong> ${escapeHtml(name)}</p>`,
        `<p><strong>Email:</strong> ${escapeHtml(email)}</p>`,
        `<hr />`,
        `<p>${escapeHtml(message).replace(/\n/g, "<br />")}</p>`,
      ].join(""),
    });
    return { status: "success" };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to send message.";
    return {
      status: "error",
      message: `Could not send email: ${message}. Please email ${site.contact.email} directly.`,
    };
  }
}
