import crypto from "node:crypto";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@asafarim/db";
import { hashCode, getMaxVerifyAttempts } from "./email-code";

/**
 * Google OAuth provider. Only active when AUTH_GOOGLE_ID/SECRET are set.
 */
export const googleProvider = Google({
  clientId: process.env.AUTH_GOOGLE_ID,
  clientSecret: process.env.AUTH_GOOGLE_SECRET,
  // Allow linking Google account to existing email/password account
  allowDangerousEmailAccountLinking: true,
});

/**
 * Password authentication — accepts either a username or an email address
 * in a single `identifier` (issue #357). A bare "does this look like an
 * email" check (contains "@") picks the lookup path; usernames are always
 * stored lowercase (see username.ts's slugifyUsername, the sole path every
 * username is ever written through), so a case-insensitive username match
 * is just an exact match against `identifier.toLowerCase()` — no DB
 * collation/citext work and no loading users into memory to compare.
 *
 * Every failure path returns null so NextAuth surfaces one generic
 * CredentialsSignin error regardless of *which* check failed (unknown
 * identifier, wrong password, OAuth-only account, deactivated account) —
 * deliberately not distinguishing them, so a failed attempt can't be used to
 * enumerate which usernames/emails exist.
 *
 * Exported standalone (rather than inlined in `Credentials({ authorize })`)
 * so it's directly unit-testable — next-auth v5's `Credentials()` factory
 * replaces `authorize` with a no-op `() => null` stub outside its own
 * request-handling runtime, so a wrapped version can't be exercised in
 * plain unit tests at all.
 */
export async function authorizeCredentials(
  credentials: Record<string, unknown> | undefined
): Promise<{ id: string; email: string; name: string | null; image: string | null } | null> {
  const identifier = String(credentials?.identifier ?? "").trim();
  const password = String(credentials?.password ?? "");
  if (!identifier || !password) {
    return null;
  }

  const user = identifier.includes("@")
    ? await prisma.user.findUnique({ where: { email: identifier.toLowerCase() } })
    : await prisma.user.findUnique({ where: { username: identifier.toLowerCase() } });

  if (!user || !user.password) {
    // Unknown identifier, or signed up via OAuth (no password set).
    return null;
  }

  if (!user.isActive) {
    // Correct credentials on a deactivated account must still fail —
    // matches every other authentication path (email-code, OAuth signIn
    // callback), which this password path previously did not.
    return null;
  }

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
  };
}

export const credentialsProvider = Credentials({
  name: "credentials",
  credentials: {
    identifier: { label: "Username or email", type: "text" },
    password: { label: "Password", type: "password" },
  },
  authorize: authorizeCredentials,
});

/**
 * Email one-time code credentials provider.
 *
 * The sign-in page calls signIn("email-code", { email, code }) after the user
 * submits their 6-character code. This authorize() function is the canonical
 * security gate: it rate-checks, hash-compares, and single-use-marks the code.
 */
export const emailCodeProvider = Credentials({
  id: "email-code",
  name: "email-code",
  credentials: {
    email: { label: "Email", type: "email" },
    code: { label: "Code", type: "text" },
  },
  async authorize(credentials) {
    if (!credentials?.email || !credentials?.code) return null;

    const email = (credentials.email as string).toLowerCase().trim();
    const submittedHash = hashCode(credentials.code as string);
    const now = new Date();

    // Most recent active (unused, unexpired) code for this email
    const record = await prisma.emailLoginCode.findFirst({
      where: { email, usedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
    });

    if (!record) return null;

    // Enforce per-code attempt limit (brute-force protection)
    if (record.attempts >= getMaxVerifyAttempts()) return null;

    // Constant-time comparison
    const storedBuf = Buffer.from(record.codeHash, "hex");
    const submittedBuf = Buffer.from(submittedHash, "hex");
    const match =
      storedBuf.length === submittedBuf.length &&
      crypto.timingSafeEqual(storedBuf, submittedBuf);

    if (!match) {
      await prisma.emailLoginCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      return null;
    }

    // User must exist and be active
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, image: true, isActive: true },
    });

    if (!user || !user.isActive) {
      // Consume code anyway so it cannot be reused
      await prisma.emailLoginCode.update({
        where: { id: record.id },
        data: { usedAt: now },
      });
      return null;
    }

    // Mark code as consumed (single-use enforcement)
    await prisma.emailLoginCode.update({
      where: { id: record.id },
      data: { usedAt: now },
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
    };
  },
});

/**
 * Hash a password for storage
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
