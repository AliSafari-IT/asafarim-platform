"use server";

import { createTransport } from "@asafarim/auth/mailer";
import { prisma } from "@asafarim/db";
import { site } from "../../content/site";
import {
  buildNewsletterIncentiveEmail,
  NEWSLETTER_INCENTIVE_FILENAME,
  resolveNewsletterIncentivePath,
} from "./newsletter-incentive";

export type NewsletterFormState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string };

function isValidEmail(email: string): boolean {
  if (email.length > 200 || email.length < 3) return false;

  const [local, domain, ...rest] = email.split("@");
  if (!local || !domain || rest.length > 0 || local.length > 64) return false;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) {
    return false;
  }
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)) return false;
  if (domain.length > 253 || !domain.includes(".")) return false;

  return domain.split(".").every(
    (label) =>
      label.length > 0 &&
      label.length <= 63 &&
      /^[a-z0-9-]+$/i.test(label) &&
      !label.startsWith("-") &&
      !label.endsWith("-"),
  );
}

/**
 * Homepage email capture and one-time incentive delivery. The subscriber row
 * is upserted first, then the PDF is sent only when `incentiveSentAt` is empty.
 * A delivery failure leaves that marker empty so the visitor can retry without
 * creating a duplicate subscription.
 *
 * `company` is an invisible honeypot field: a non-empty value is treated as a
 * bot submission and quietly returns success without writing or sending.
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
    const subscriber = await prisma.newsletterSubscriber.upsert({
      where: { email },
      create: { email, source: "web-home" },
      update: { unsubscribedAt: null },
    });

    if (subscriber.incentiveSentAt) {
      return { status: "success" };
    }

    const attachmentPath = await resolveNewsletterIncentivePath();
    const { subject, text, html } = buildNewsletterIncentiveEmail();
    const { transporter, from, bcc } = createTransport();
    const delivery = await transporter.sendMail({
      from,
      to: email,
      bcc,
      subject,
      text,
      html,
      attachments: [
        {
          filename: NEWSLETTER_INCENTIVE_FILENAME,
          path: attachmentPath,
          contentType: "application/pdf",
        },
      ],
    });

    await prisma.newsletterSubscriber.update({
      where: { id: subscriber.id },
      data: {
        incentiveSentAt: new Date(),
        incentiveMessageId: delivery.messageId || null,
      },
    });

    // Preserve the existing owner notification without allowing an internal
    // notification failure to invalidate successful subscriber delivery.
    try {
      await transporter.sendMail({
        from,
        to: site.contact.email,
        subject: "New newsletter subscriber",
        text: `${email} joined the asafarim.com mailing list and received the Vionto architecture guide.`,
      });
    } catch {
      // Best-effort internal notification.
    }

    return { status: "success" };
  } catch (error) {
    console.error("[newsletter] Subscription or incentive delivery failed", error);
    return {
      status: "error",
      message:
        "We could not send the guide right now. Please check the address and try again in a moment.",
    };
  }
}
