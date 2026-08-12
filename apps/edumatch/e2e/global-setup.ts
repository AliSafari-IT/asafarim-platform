import { chromium, type FullConfig } from "@playwright/test";
import path from "node:path";

/**
 * Authenticates a seeded student and tutor through the real Hub sign-in form
 * and saves their shared localhost session cookies for the EduMatch E2E suite.
 * Every presentation member receives the same bcrypt-hashed password from
 * EDUMATCH_SEED_USERS_PASSWORD during seeding; this setup never rewrites it.
 */
const configuredPassword = process.env.EDUMATCH_SEED_USERS_PASSWORD;
if (!configuredPassword) {
  throw new Error("EDUMATCH_SEED_USERS_PASSWORD is required for EduMatch E2E.");
}
const E2E_PASSWORD: string = configuredPassword;

const STUDENT_EMAIL = "asafarim+edustudent01@gmail.com";
const TUTOR_EMAIL = "asafarim+edututor01@gmail.com";

export const STUDENT_STORAGE_STATE = path.join(
  __dirname,
  ".auth",
  "student.json"
);
export const TUTOR_STORAGE_STATE = path.join(__dirname, ".auth", "tutor.json");

async function loginAndSave(
  hubUrl: string,
  email: string,
  storageStatePath: string
) {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(`${hubUrl}/sign-in`);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), {
    timeout: 15_000,
  });

  await page.context().storageState({ path: storageStatePath });
  await browser.close();
}

export default async function globalSetup(_config: FullConfig) {
  const hubUrl = process.env.PLAYWRIGHT_HUB_URL || "http://localhost:3001";

  await loginAndSave(hubUrl, STUDENT_EMAIL, STUDENT_STORAGE_STATE);
  await loginAndSave(hubUrl, TUTOR_EMAIL, TUTOR_STORAGE_STATE);
}
