import { chromium, type FullConfig } from "@playwright/test";
import path from "node:path";
import bcrypt from "bcryptjs";
import { prisma } from "@asafarim/db";

// Deliberately not importing from "@asafarim/auth": its root export pulls in
// the full server-only Auth.js/Prisma surface (next/headers etc.), which
// only works inside the Next.js runtime — not this standalone Playwright
// setup script. bcryptjs directly is the same hashing @asafarim/auth uses
// under the hood (see packages/auth/src/providers.ts's hashPassword).
async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/**
 * Authenticates a student and a tutor once before the whole E2E run and
 * saves each session as a Playwright storageState file, so individual specs
 * can `test.use({ storageState })` instead of re-logging-in per test.
 *
 * The demo users seeded by `packages/seed-manager` (definitions/edumatch.ts)
 * are display-only — `password` is intentionally null so a real person can
 * never sign in as one by guessing. For E2E we set a throwaway password on
 * the two demo accounts directly (idempotent: just overwrites the hash), log
 * in through the real Hub sign-in form, and capture the resulting session
 * cookie. Cookies are scoped to `Domain=localhost` in dev (see
 * packages/auth/src/config.ts's getCookieDomain), so a session established
 * against Hub (3001) is valid on EduMatch (3009) too.
 */
const E2E_PASSWORD = "E2eTest+123456";
const STUDENT_EMAIL = "demo.student1@edumatch.demo";
const TUTOR_EMAIL = "demo.tutor1@edumatch.demo";

export const STUDENT_STORAGE_STATE = path.join(__dirname, ".auth", "student.json");
export const TUTOR_STORAGE_STATE = path.join(__dirname, ".auth", "tutor.json");

async function loginAndSave(hubUrl: string, email: string, storageStatePath: string) {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(`${hubUrl}/sign-in`);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();

  // Successful credentials sign-in redirects away from /sign-in.
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 15_000 });

  await page.context().storageState({ path: storageStatePath });
  await browser.close();
}

export default async function globalSetup(config: FullConfig) {
  const hubUrl = process.env.PLAYWRIGHT_HUB_URL || "http://localhost:3001";

  const hash = await hashPassword(E2E_PASSWORD);
  await prisma.user.update({ where: { email: STUDENT_EMAIL }, data: { password: hash } });
  await prisma.user.update({ where: { email: TUTOR_EMAIL }, data: { password: hash } });
  await prisma.$disconnect();

  await loginAndSave(hubUrl, STUDENT_EMAIL, STUDENT_STORAGE_STATE);
  await loginAndSave(hubUrl, TUTOR_EMAIL, TUTOR_STORAGE_STATE);
}
