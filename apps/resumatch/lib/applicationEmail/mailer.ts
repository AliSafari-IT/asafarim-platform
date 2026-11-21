import "server-only";
import type { ApplicationEmailConfig } from "./config";

/**
 * The one boundary between ResuMatch and an email provider.
 *
 * Every outcome is one of three, and the difference between the last two is
 * the whole point of this module:
 *
 * - `accepted`: the provider took responsibility for the message (SMTP
 *   250 after DATA). That is "sent", not "delivered".
 * - `rejected`: the provider answered with a refusal, or the message never
 *   left (no connection, bad login, recipient refused). Nothing was sent;
 *   trying again cannot cause a duplicate.
 * - `uncertain`: the connection broke or timed out after the message may
 *   already have been handed over. The provider may or may not deliver it.
 *   The caller must never resend on its own.
 *
 * When in doubt the classification is `uncertain`: telling a candidate "not
 * sent" about an email a recruiter then receives twice is the worse error.
 */

export interface OutgoingAttachment {
  filename: string;
  content: Uint8Array;
  contentType: "application/pdf";
}

export interface OutgoingEmail {
  from: { name: string; address: string };
  to: { name: string | null; address: string };
  replyTo: string | null;
  bcc: string | null;
  subject: string;
  text: string;
  /** Full Message-ID header value, "<id@domain>". */
  messageId: string;
  attachments: OutgoingAttachment[];
}

export type SendOutcome =
  | { kind: "accepted"; providerMessageId: string | null; response: string | null }
  | { kind: "rejected"; code: string; response: string | null }
  | { kind: "uncertain"; code: string };

export interface ApplicationMailer {
  readonly name: "smtp" | "fixture";
  send(email: OutgoingEmail): Promise<SendOutcome>;
}

/** Response lines are logged and stored; message content never is. */
export function safeResponse(response: unknown): string | null {
  if (typeof response !== "string" || !response) return null;
  // eslint-disable-next-line no-control-regex
  return response.replace(/[\u0000-\u001f\u007f]+/g, " ").slice(0, 300);
}

/** SMTP commands that run before the message itself is handed over. A
 *  network failure during one of these means nothing was sent. */
const BEFORE_DATA = new Set(["CONN", "EHLO", "HELO", "LHLO", "STARTTLS", "AUTH", "AUTH PLAIN", "AUTH LOGIN", "AUTH XOAUTH2", "AUTH CRAM-MD5", "MAIL FROM", "RCPT TO"]);
const BEFORE_DATA_CODES = new Set(["EDNS", "ECONNECTION", "EAUTH", "ETLS", "EENVELOPE", "ENOAUTH", "EOAUTH2", "EMESSAGE", "EREQUIRETLS"]);

/**
 * Turn a nodemailer error into an outcome. Exported for tests.
 *
 * - A numeric SMTP reply code (4xx/5xx) is the server's own answer: a
 *   refusal, so `rejected`, even at DATA — a server that says no to the
 *   message did not take it.
 * - A failure during a command that runs before the message (connect,
 *   greeting, TLS, login, envelope) is `rejected`: nothing was sent.
 * - Anything else — a timeout or socket error while the message was being
 *   streamed or while waiting for the final reply, or an error we don't
 *   recognise — is `uncertain`.
 */
export function classifySmtpError(error: unknown): SendOutcome {
  const e = (error ?? {}) as { code?: unknown; command?: unknown; responseCode?: unknown; response?: unknown };
  const code = typeof e.code === "string" ? e.code : "UNKNOWN";
  const command = typeof e.command === "string" ? e.command.toUpperCase() : null;
  const responseCode = typeof e.responseCode === "number" ? e.responseCode : null;

  if (responseCode !== null && responseCode >= 400 && responseCode < 600) {
    return { kind: "rejected", code: `SMTP_${responseCode}`, response: safeResponse(e.response) };
  }
  if (command && BEFORE_DATA.has(command)) {
    return { kind: "rejected", code: `${code}_${command.replace(/\s+/g, "_")}`, response: null };
  }
  if (!command && BEFORE_DATA_CODES.has(code)) {
    return { kind: "rejected", code, response: null };
  }
  return { kind: "uncertain", code };
}

export async function createSmtpMailer(config: ApplicationEmailConfig): Promise<ApplicationMailer> {
  if (!config.smtp) throw new Error("SMTP is not configured");
  const smtp = config.smtp;
  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    requireTLS: smtp.requireTls,
    auth: { user: smtp.user, pass: smtp.password },
    connectionTimeout: Math.min(config.timeoutMs, 15_000),
    greetingTimeout: Math.min(config.timeoutMs, 15_000),
    socketTimeout: config.timeoutMs,
  });

  return {
    name: "smtp",
    async send(email) {
      try {
        const info = await transporter.sendMail({
          from: email.from,
          to: email.to.name ? { name: email.to.name, address: email.to.address } : email.to.address,
          bcc: email.bcc ?? undefined,
          replyTo: email.replyTo ?? undefined,
          subject: email.subject,
          text: email.text,
          messageId: email.messageId,
          attachments: email.attachments.map((a) => ({
            filename: a.filename,
            content: Buffer.from(a.content),
            contentType: a.contentType,
          })),
          // Never let a header or body value be read as a file path or URL.
          disableFileAccess: true,
          disableUrlAccess: true,
        });
        const rejected = ((info.rejected ?? []) as (string | { address: string })[]).map((r) => (typeof r === "string" ? r : r.address).toLowerCase());
        if (rejected.includes(email.to.address.toLowerCase())) {
          return { kind: "rejected", code: "RECIPIENT_REJECTED", response: safeResponse(info.response) };
        }
        return { kind: "accepted", providerMessageId: info.messageId ?? null, response: safeResponse(info.response) };
      } catch (error) {
        return classifySmtpError(error);
      }
    },
  };
}

/**
 * Network-free mailer for local development, tests and CI. Recipients at
 * the reserved `.test` domain choose an outcome, so every branch of the send
 * flow can be exercised end to end:
 *
 * - `reject@…test`: a definite refusal;
 * - `timeout@…test`: an uncertain result;
 * - anything else: accepted.
 *
 * `sent` keeps every accepted message in memory (tests read it).
 */
export function createFixtureMailer(): ApplicationMailer & { sent: OutgoingEmail[] } {
  const sent: OutgoingEmail[] = [];
  return {
    name: "fixture",
    sent,
    async send(email) {
      const local = email.to.address.toLowerCase();
      if (/^reject@[^@]+\.test$/.test(local)) return { kind: "rejected", code: "SMTP_550", response: "550 5.1.1 fixture: mailbox unavailable" };
      if (/^timeout@[^@]+\.test$/.test(local)) return { kind: "uncertain", code: "ETIMEDOUT" };
      sent.push(email);
      return { kind: "accepted", providerMessageId: email.messageId, response: "250 2.0.0 fixture: queued" };
    },
  };
}

let fixtureSingleton: ReturnType<typeof createFixtureMailer> | null = null;

export async function getApplicationMailer(config: ApplicationEmailConfig): Promise<ApplicationMailer | null> {
  if (config.unavailableReason) return null;
  if (config.transport === "fixture") return (fixtureSingleton ??= createFixtureMailer());
  if (config.transport === "smtp") return createSmtpMailer(config);
  return null;
}
