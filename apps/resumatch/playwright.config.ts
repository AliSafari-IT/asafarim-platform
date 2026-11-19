import { defineConfig, devices } from "@playwright/test";

/**
 * ResuMatch browser regression suite (issue #896 started it).
 *
 * Runs against `next dev` on 3012 and a disposable database named by
 * RESUMATCH_DATABASE_URL (migrated beforehand, never the dev one: the
 * suite deletes and re-creates its own workspace). No Hub: e2e/fixtures.ts
 * mints a session cookie with AUTH_SECRET, the way Hub's JWT would look,
 * so the app's real proxy and workspace checks still run.
 *
 * One worker, because specs reseed the same workspace before each test.
 * Both projects are Chromium (a desktop and a phone profile), so CI installs
 * one browser. PW_CHROMIUM_PATH points at a preinstalled Chromium instead.
 */
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3012",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    launchOptions: { executablePath },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } } },
    { name: "Mobile Chrome", use: { ...devices["Pixel 5"], launchOptions: { executablePath } } },
  ],
  webServer: {
    command: "pnpm exec next dev --port 3012",
    // The public landing page: /api/health is 503 without Redis.
    url: "http://localhost:3012/",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
