import { defineConfig, devices } from "@playwright/test";

/**
 * AI Workbench launch E2E (#684). Runs against a production build in
 * fixture mode: no provider keys, no billable calls, deterministic results.
 * The server's output is written to e2e/.artifacts/server.log so a test can
 * prove it holds no tool content.
 */
const PORT = 3200;
const BASE_URL = `http://localhost:${PORT}`;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.artifacts/results",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "e2e/.artifacts/report" }]] : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    acceptDownloads: true,
    launchOptions: { executablePath },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } } },
    { name: "mobile", use: { ...devices["Pixel 5"], launchOptions: { executablePath } } },
  ],
  webServer: {
    // Production server; build first (`next build`). Output goes to a file the log test reads.
    command: `mkdir -p e2e/.artifacts && next start --port ${PORT} > e2e/.artifacts/server.log 2>&1`,
    url: `${BASE_URL}/tools`,
    reuseExistingServer: false,
    timeout: 120_000,
    // AUTH_SECRET is a throwaway for the local E2E server only (the tools themselves never use auth).
    env: { AI_TOOLS_MODE: "fixture", AI_TOOLS_KILL_SWITCH: "", NODE_ENV: "production", AUTH_SECRET: process.env.AUTH_SECRET || "e2e-only-throwaway-secret-not-used-anywhere" },
  },
});
