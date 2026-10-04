import { chromium, type FullConfig } from "@playwright/test";
import path from "node:path";

/**
 * Signs the seeded admin in through Hub's real sign-in form once and saves the session cookies for the specs
 * that need a signed-in browser. SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD are the same values `pnpm db:seed` used.
 */
export const ADMIN_STORAGE_STATE = path.join(__dirname, ".auth", "admin.json");

export function adminCredentials(): { email: string; password: string } {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password)
    throw new Error(
      "SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required for Hub E2E."
    );
  return { email, password };
}

export default async function globalSetup(_config: FullConfig) {
  const hubUrl = process.env.E2E_HUB_URL || "http://localhost:3001";
  const { email, password } = adminCredentials();
  // E2E_CHROMIUM_PATH: use an already-installed Chromium instead of the one Playwright pins (offline sandboxes).
  const browser = await chromium.launch({
    executablePath: process.env.E2E_CHROMIUM_PATH || undefined,
  });
  try {
    const page = await browser.newPage();
    await page.goto(`${hubUrl}/sign-in`);
    await page.locator("#identifier").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), {
      timeout: 30_000,
    });
    await page.context().storageState({ path: ADMIN_STORAGE_STATE });
  } finally {
    await browser.close();
  }
}
