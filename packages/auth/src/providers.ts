import crypto from "node:crypto";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@asafarim/db";

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
 * Email/password credentials provider
 */
export const credentialsProvider = Credentials({
  name: "credentials",
  credentials: {
    email: { label: "Email", type: "email" },
    password: { label: "Password", type: "password" },
  },
  async authorize(credentials) {
    if (!credentials?.email || !credentials?.password) {
      return null;
    }

    const email = credentials.email as string;
    const password = credentials.password as string;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.password) {
      // User doesn't exist or signed up via OAuth (no password set)
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
  },
});

// ─── Email-code helpers ───────────────────────────────────────────────────────

function hashEmailCode(code: string): string {
  return crypto.createHash("sha256").update(code.toUpperCase()).digest("hex");
}

function getMaxVerifyAttempts(): number {
  const raw = Number(process.env.EMAIL_CODE_MAX_ATTEMPTS ?? "5");
  if (!Number.isFinite(raw) || raw <= 0) return 5;
  return Math.floor(raw);
}

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
    const submittedHash = hashEmailCode(credentials.code as string);
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
