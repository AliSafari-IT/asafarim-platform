import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

loadEnv({ path: path.join(process.cwd(), "../../.env.local") });
loadEnv({ path: path.join(process.cwd(), "../../.env") });

const PORT = 3010;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  // Next.js dev mode (Turbopack) compiles each route on first hit — give
  // the first navigation to an uncompiled route room to breathe rather
  // than flaking the whole suite on cold-start latency.
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "Mobile Chrome", use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    command: "next dev --port 3010",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      // Guest flows need a trusted-proxy hop configured to accept
      // X-Forwarded-For, same as every manual dev-server check this app
      // has been verified against throughout development.
      TIMELINEAI_TRUSTED_PROXY_HOPS: "1",
      TIMELINEAI_GUEST_IP_HASH_KEY: "e2e-test-key-0123456789abcdef",
    },
  },
});
