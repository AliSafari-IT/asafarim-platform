import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

loadEnv({ path: path.join(process.cwd(), "../../.env.local") });
loadEnv({ path: path.join(process.cwd(), "../../.env") });

const APPBUILDER_PORT = 3006;
const HUB_PORT = 3001;
const WORKER_HEALTH_PORT = 3008;
const BASE_URL = `http://localhost:${APPBUILDER_PORT}`;

export default defineConfig({
  testDir: "./tests/e2e/specs",
  outputDir: "./.playwright/artifacts",
  globalSetup: "./tests/e2e/global-setup.ts",
  // Deterministic, not fast: shared fixture apps/DB rows mean parallel
  // workers would race each other (same pattern as
  // benchmarks/testora/playwright.config.ts).
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Next.js dev mode (Turbopack) compiles each route on first hit — the
  // very first navigation to a not-yet-compiled preview route can take
  // several seconds before the response even starts. A production build
  // has no such delay; this margin exists only to keep the suite reliable
  // against `next dev`.
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [
    ["list"],
    ["json", { outputFile: "./.playwright/report.json" }],
    ["html", { outputFolder: "./.playwright/report", open: "never" }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @asafarim/hub dev",
      url: `http://localhost:${HUB_PORT}`,
      cwd: path.join(process.cwd(), "../.."),
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @asafarim/appbuilder dev",
      url: BASE_URL,
      cwd: path.join(process.cwd(), "../.."),
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // M07 generation worker — forced onto the deterministic fake provider
      // regardless of local .env, so the e2e suite never makes a real,
      // billable provider call. Readiness is its own health endpoint (it
      // has no other HTTP surface). Requires REDIS_URL to already point at
      // a reachable Redis (docker compose's `redis` service).
      command: "pnpm --filter @asafarim/appbuilder worker:dev",
      url: `http://localhost:${WORKER_HEALTH_PORT}`,
      cwd: path.join(process.cwd(), "../.."),
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { APPBUILDER_AI_PROVIDER: "fake", APPBUILDER_WORKER_HEALTH_PORT: String(WORKER_HEALTH_PORT) },
    },
  ],
});
