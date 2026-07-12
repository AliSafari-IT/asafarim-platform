import nodemailer, { type Transporter } from "nodemailer";

function parseBoolean(value: string | undefined, defaultValue = false): boolean {
  if (value == null || value.trim() === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? "465");
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM;

  if (!host || !user || !password || !from) {
    throw new Error(
      "SMTP configuration is incomplete. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM.",
    );
  }

  return {
    host,
    port,
    user,
    password,
    from,
    secure: parseBoolean(process.env.SMTP_SECURE, true),
    requireTls: parseBoolean(process.env.SMTP_REQUIRE_TLS, false),
    bcc: process.env.SMTP_BCC || undefined,
  };
}

/** Lazily creates a nodemailer transport from env-configured SMTP settings. */
export function createTransport(): { transporter: Transporter; from: string; bcc?: string } {
  const config = getSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
    requireTLS: config.requireTls,
  });
  return { transporter, from: config.from, bcc: config.bcc };
}
