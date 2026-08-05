import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = process.env.FROM_EMAIL || "EduMatch <noreply@asafarim.com>";

export type EmailType =
  | "inquiry_received"
  | "ai_response_ready"
  | "quote_received"
  | "booking_confirmed"
  | "payout_sent";

type EmailPayload = {
  inquiry_received: {
    studentName: string;
    subject: string;
    inquiryId: string;
  };
  ai_response_ready: {
    studentName: string;
    subject: string;
    inquiryId: string;
    preview: string;
  };
  quote_received: {
    studentName: string;
    tutorName: string;
    subject: string;
    quoteId: string;
    totalAmount: number;
    currency: string;
    pdfUrl?: string;
  };
  booking_confirmed: {
    studentName: string;
    tutorName: string;
    subject: string;
    bookingId: string;
    scheduledAt: string;
    mode: string;
  };
  payout_sent: {
    tutorName: string;
    amount: number;
    currency: string;
    payoutId: string;
  };
};

const templates: Record<EmailType, (data: any) => { subject: string; html: string }> = {
  inquiry_received: (data: EmailPayload["inquiry_received"]) => ({
    subject: `Inquiry received: ${data.subject}`,
    html: `
      <h2>Hi ${data.studentName},</h2>
      <p>We've received your inquiry about <strong>${data.subject}</strong>.</p>
      <p>Our AI is preparing a personalized explanation. You'll receive another email when it's ready.</p>
      <p>Inquiry ID: ${data.inquiryId}</p>
      <hr>
      <p style="color: #666; font-size: 12px;">EduMatch - Learn smarter, one match at a time.</p>
    `,
  }),

  ai_response_ready: (data: EmailPayload["ai_response_ready"]) => ({
    subject: `AI explanation ready: ${data.subject}`,
    html: `
      <h2>Hi ${data.studentName},</h2>
      <p>Your AI explanation for <strong>${data.subject}</strong> is ready!</p>
      <blockquote style="border-left: 3px solid #059669; padding-left: 12px; color: #444;">
        ${data.preview.substring(0, 200)}...
      </blockquote>
      <p><a href="https://edumatch.asafarim.com/student/inquiry/${data.inquiryId}" style="background: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 16px;">View Full Response</a></p>
      <p>Want personalized help? Click the button above to request quotes from qualified tutors.</p>
      <hr>
      <p style="color: #666; font-size: 12px;">EduMatch - Learn smarter, one match at a time.</p>
    `,
  }),

  quote_received: (data: EmailPayload["quote_received"]) => ({
    subject: `New quote from ${data.tutorName}: ${data.subject}`,
    html: `
      <h2>Hi ${data.studentName},</h2>
      <p><strong>${data.tutorName}</strong> has submitted a quote for your inquiry about <strong>${data.subject}</strong>.</p>
      <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0; font-size: 24px; font-weight: bold; color: #059669;">
          ${data.currency} ${data.totalAmount}
        </p>
        <p style="margin: 8px 0 0; color: #666;">Total estimated cost</p>
      </div>
      <p><a href="https://edumatch.asafarim.com/student" style="background: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View & Accept Quote</a></p>
      ${data.pdfUrl ? `<p><a href="${data.pdfUrl}" style="color: #059669;">Download Quote PDF</a></p>` : ""}
      <hr>
      <p style="color: #666; font-size: 12px;">EduMatch - Learn smarter, one match at a time.</p>
    `,
  }),

  booking_confirmed: (data: EmailPayload["booking_confirmed"]) => ({
    subject: `Booking confirmed: ${data.subject}`,
    html: `
      <h2>Hi ${data.studentName},</h2>
      <p>Your booking with <strong>${data.tutorName}</strong> for <strong>${data.subject}</strong> is confirmed!</p>
      <div style="background: #ecfdf5; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0;"><strong>When:</strong> ${data.scheduledAt}</p>
        <p style="margin: 8px 0 0;"><strong>Mode:</strong> ${data.mode}</p>
        <p style="margin: 8px 0 0;"><strong>Booking ID:</strong> ${data.bookingId}</p>
      </div>
      <p>Your tutor will contact you shortly with session details.</p>
      <hr>
      <p style="color: #666; font-size: 12px;">EduMatch - Learn smarter, one match at a time.</p>
    `,
  }),

  payout_sent: (data: EmailPayload["payout_sent"]) => ({
    subject: `Payout sent: ${data.currency} ${data.amount}`,
    html: `
      <h2>Hi ${data.tutorName},</h2>
      <p>We've sent a payout to your account!</p>
      <div style="background: #ecfdf5; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0; font-size: 24px; font-weight: bold; color: #059669;">
          ${data.currency} ${data.amount}
        </p>
        <p style="margin: 8px 0 0; color: #666;">Payout ID: ${data.payoutId}</p>
      </div>
      <p>The funds should appear in your bank account within 2-3 business days.</p>
      <p><a href="https://edumatch.asafarim.com/tutor" style="background: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Wallet</a></p>
      <hr>
      <p style="color: #666; font-size: 12px;">EduMatch - Learn smarter, one match at a time.</p>
    `,
  }),
};

export async function sendEmail<T extends EmailType>(
  type: T,
  to: string,
  data: EmailPayload[T]
): Promise<{ id?: string; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY not configured, skipping email");
    return { error: "Email not configured" };
  }

  const template = templates[type];
  const { subject, html } = template(data);

  try {
    const { data: result, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });

    if (error) {
      console.error("[email] Failed to send:", error);
      return { error: error.message };
    }

    console.log(`[email] Sent ${type} to ${to}, id: ${result?.id}`);
    return { id: result?.id };
  } catch (err) {
    console.error("[email] Exception:", err);
    return { error: String(err) };
  }
}

// Queue-friendly wrapper for BullMQ
export async function sendEmailJob(
  type: EmailType,
  to: string,
  data: unknown
): Promise<{ id?: string; error?: string }> {
  return sendEmail(type, to, data as any);
}
