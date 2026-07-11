import { defineConfig, devices } from "@playwright/test";

const PORT = 4319;
const BASE_URL = `http://localhost:${PORT}`;

/**
 * Deterministic benchmark configuration.
 *
 * - `workers: 1` + `fullyParallel: false` — reproducible ordering and timing.
 * - `retries: 1` — the flaky scenario relies on a retry to expose its
 *   fail-then-pass signature (see fixtures/scenarios.mjs). Seeded hard failures
 *   still stay failed across both attempts.
 * - Full artifacts (`trace`/`screenshot`/`video` = "on") so the benchmark can
 *   score artifact completeness on every result, not just failures.
 * - JSON report at a stable path is the input to scripts/generate-fixtures.mjs.
 */
export default defineConfig({
  testDir: "./tests",
  outputDir: "./.playwright/artifacts",
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "./.playwright/report.json" }],
    ["html", { outputFolder: "./.playwright/report", open: "never" }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: "on",
    screenshot: "on",
    video: "on",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "node sample-app/server.mjs",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    env: { PORT: String(PORT) },
  },
});
