import { defineConfig, devices } from "@playwright/test";

const PORT = 3013;
const baseURL = process.env.TASKSAI_E2E_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * Playwright harness. M01 ships one smoke journey (landing renders, health
 * endpoint is green). The real journeys — onboarding, task CRUD, views —
 * arrive with M03. CI runs these only when RUN_E2E is set, since they need
 * a built app and a database.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.TASKSAI_E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm start",
        port: PORT,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
