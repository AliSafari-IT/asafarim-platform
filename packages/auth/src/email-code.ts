/**
 * Email one-time login code — generation, hashing, rate limiting, and
 * delivery. `emailCodeProvider` in providers.ts is the *verification* side
 * (NextAuth's authorize()); this module is the *request* side, called from
 * the app's `/api/auth/email-code/request` route.
 *
 * Security properties:
 *  - Codes are 6 characters: uppercase A-Z and digits 0-9, always at least
 *    one letter and one digit.
 *  - Codes are stored as SHA-256 hashes — the plaintext is never persisted.
 *  - Codes are single-use and expire after EMAIL_LOGIN_CODE_TTL_MINUTES.
 *  - Request rate limit: max EMAIL_CODE_MAX_REQUESTS per email per
 *    EMAIL_CODE_REQUEST_WINDOW_MINUTES.
 *  - Verify rate limit: max EMAIL_CODE_MAX_ATTEMPTS failed attempts per code.
 */
import crypto from "node:crypto";
import { prisma } from "@asafarim/db";
import { createTransport } from "./mailer";

// ─── Config ─────────────────────────────────────────────────────────────────

export function getCodeTtlMinutes(): number {
  const raw = Number(process.env.EMAIL_LOGIN_CODE_TTL_MINUTES ?? "10");
  if (!Number.isFinite(raw) || raw <= 0) return 10;
  return Math.floor(raw);
}

function getMaxRequests(): number {
  const raw = Number(process.env.EMAIL_CODE_MAX_REQUESTS ?? "5");
  if (!Number.isFinite(raw) || raw <= 0) return 5;
  return Math.floor(raw);
}

function getRequestWindowMinutes(): number {
  const raw = Number(process.env.EMAIL_CODE_REQUEST_WINDOW_MINUTES ?? "15");
  if (!Number.isFinite(raw) || raw <= 0) return 15;
  return Math.floor(raw);
}

/** Max failed verification attempts per code before it is locked. Shared with providers.ts. */
export function getMaxVerifyAttempts(): number {
  const raw = Number(process.env.EMAIL_CODE_MAX_ATTEMPTS ?? "5");
  if (!Number.isFinite(raw) || raw <= 0) return 5;
  return Math.floor(raw);
}

// ─── Code generation ────────────────────────────────────────────────────────

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";

/**
 * Cryptographically random 6-character code: 1-5 letters + 1-5 digits
 * (always at least one of each), Fisher-Yates shuffled with crypto.randomInt.
 */
export function generateCode(): string {
  const letterCount = 1 + crypto.randomInt(5); // 1..5 inclusive
  const digitCount = 6 - letterCount;

  const chars: string[] = [];
  for (let i = 0; i < letterCount; i++) chars.push(LETTERS[crypto.randomInt(LETTERS.length)]!);
  for (let i = 0; i < digitCount; i++) chars.push(DIGITS[crypto.randomInt(DIGITS.length)]!);

  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }

  return chars.join("");
}

/** Shared with providers.ts's emailCodeProvider.authorize(). */
export function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code.toUpperCase()).digest("hex");
}

// ─── Rate limiting ──────────────────────────────────────────────────────────

async function isRequestRateLimited(email: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - getRequestWindowMinutes() * 60 * 1000);
  const count = await prisma.emailLoginCode.count({
    where: { email, createdAt: { gte: windowStart } },
  });
  return count >= getMaxRequests();
}

// ─── Code lifecycle ─────────────────────────────────────────────────────────

/**
 * Create a new login code for an email, invalidating any prior active code
 * for that email first (so only one code is ever active). Returns the
 * plaintext code — send it, never store it.
 */
async function createLoginCode(email: string): Promise<string> {
  const code = generateCode();
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + getCodeTtlMinutes() * 60 * 1000);
  const now = new Date();

  await prisma.$transaction([
    prisma.emailLoginCode.updateMany({
      where: { email, usedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    }),
    prisma.emailLoginCode.create({ data: { email, codeHash, expiresAt } }),
  ]);

  return code;
}

// ─── Delivery ───────────────────────────────────────────────────────────────

function loginCodeEmail(input: { name?: string | null; code: string; expiresInMinutes: number }) {
  const greeting = input.name?.trim() || "there";
  const platformName = process.env.NEXT_PUBLIC_PLATFORM_NAME || "ASafarIM Platform";
  const subject = `${input.code} — Your ${platformName} login code`;

  const text = [
    `Hi ${greeting},`,
    "",
    `Use the code below to sign in to ${platformName}:`,
    "",
    `    ${input.code}`,
    "",
    `This code expires in ${input.expiresInMinutes} minute${input.expiresInMinutes === 1 ? "" : "s"}.`,
    "",
    "If you did not request this code, you can safely ignore this email.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:32px 16px;background:#0b0f14;font-family:'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" style="max-width:420px;margin:0 auto;">
    <tr><td style="text-align:center;padding-bottom:20px;">
      <span style="font:700 12px/1 ui-monospace,monospace;letter-spacing:0.2em;color:#f59e0b;text-transform:uppercase;">${platformName}</span>
    </td></tr>
    <tr><td style="background:#171d26;border:1px solid #232b36;border-radius:12px;padding:28px;text-align:center;">
      <p style="margin:0 0 16px;color:#e6edf3;font-size:14px;">Hi ${greeting}, here is your sign-in code:</p>
      <p style="margin:0 0 16px;font:700 32px/1 ui-monospace,monospace;letter-spacing:0.3em;color:#f59e0b;">${input.code}</p>
      <p style="margin:0;color:#8b98a5;font-size:12px;">Expires in ${input.expiresInMinutes} minute${input.expiresInMinutes === 1 ? "" : "s"}. If you didn't request this, ignore this email.</p>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

async function sendEmailLoginCode(input: {
  to: string;
  name?: string | null;
  code: string;
  expiresInMinutes: number;
}): Promise<void> {
  const { transporter, from, bcc } = createTransport();
  const { subject, text, html } = loginCodeEmail(input);
  await transporter.sendMail({ from, to: input.to, bcc, subject, text, html });
}

// ─── Public entry point ─────────────────────────────────────────────────────

const GENERIC_MESSAGE = "If that email is registered, a login code has been sent. Check your inbox.";

export type RequestCodeResult =
  | { ok: true; message: string }
  | { ok: false; status: 400 | 429 | 500; error: string };

/**
 * Handles a login-code request end to end: validates, rate-limits, looks up
 * the user, generates + sends the code. Always returns the same generic
 * message whether or not the email is registered (anti-enumeration) — the
 * only observable difference for an unregistered email is that no code
 * actually gets sent.
 */
export async function requestEmailLoginCode(rawEmail: unknown): Promise<RequestCodeResult> {
  const email = typeof rawEmail === "string" ? rawEmail.toLowerCase().trim() : "";
  if (!email || !email.includes("@")) {
    return { ok: false, status: 400, error: "A valid email address is required." };
  }

  if (await isRequestRateLimited(email)) {
    return {
      ok: false,
      status: 429,
      error: "Too many code requests. Please wait a few minutes and try again.",
    };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, isActive: true },
  });

  if (!user || !user.isActive) {
    return { ok: true, message: GENERIC_MESSAGE };
  }

  try {
    const code = await createLoginCode(email);
    await sendEmailLoginCode({ to: email, name: user.name, code, expiresInMinutes: getCodeTtlMinutes() });
  } catch (error) {
    console.error("[email-code] failed to send login code:", error);
    return { ok: false, status: 500, error: "Unable to send login code right now. Please try again later." };
  }

  return { ok: true, message: GENERIC_MESSAGE };
}
