"use server";

import { prisma } from "@asafarim/db";
import { createTransport } from "@asafarim/auth/mailer";
import { site } from "../../content/site";

export type NewsletterFormState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string };

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200;
}

/**
 * Homepage email capture. Deliberately minimal: no confirmation flow (this
 * isn't sending campaigns itself, just building the list) and no error
 * leaked for a duplicate signup — resubmitting the same address is a no-op,
 * not a failure, from the visitor's point of view.
 *
 * `company` is an invisible honeypot field (see NewsletterSignup.tsx): real
 * visitors never fill it, so a non-empty value means a bot and we quietly
 * report success without writing anything.
 */
export async function subscribeToNewsletter(
  _prevState: NewsletterFormState,
  formData: FormData,
): Promise<NewsletterFormState> {
  const honeypot = String(formData.get("company") ?? "").trim();
  if (honeypot) {
    return { status: "success" };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!isValidEmail(email)) {
    return { status: "error", message: "Please enter a valid email address." };
  }

  try {
    const existing = await prisma.newsletterSubscriber.findUnique({ where: { email } });

    if (!existing) {
      await prisma.newsletterSubscriber.create({
        data: { email, source: "web-home" },
      });

      // Best-effort notification — the subscriber row is already saved
      // either way, so a mail failure here never turns into a user-facing error.
      try {
        const { transporter, from, bcc } = createTransport();
        await transporter.sendMail({
          from,
          to: site.contact.email,
          bcc,
          subject: "New newsletter subscriber",
          text: `${email} joined the asafarim.com mailing list.`,
        });
      } catch {
        // Delivery is best-effort; the subscriber is already stored.
      }
    } else if (existing.unsubscribedAt) {
      // Re-subscribing after a prior opt-out.
      await prisma.newsletterSubscriber.update({
        where: { email },
        data: { unsubscribedAt: null },
      });
    }

    return { status: "success" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to subscribe.";
    return {
      status: "error",
      message: `Could not subscribe: ${message}. Please email ${site.contact.email} directly.`,
    };
  }
}
