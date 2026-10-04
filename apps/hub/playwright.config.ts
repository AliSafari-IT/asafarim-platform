import { defineConfig, devices } from "@playwright/test";
import { generateKeyPairSync } from "node:crypto";

/**
 * Hub's end-to-end suite (#803): the OIDC hand-off (/oidc/continue) in a real browser, against a stub identity
 * service (e2e/stubs/identity.ts). Needs a migrated, seeded database (pnpm db:migrate:deploy && pnpm db:seed
 * with SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD set) and AUTH_SECRET; see .github/workflows/hub-e2e.yml.
 *
 * Test keys: two Ed25519 pairs, generated here per run and handed to both servers through the environment.
 * Nothing is committed. A worker re-evaluates this file, so a value already in the environment is reused.
 */
function jwkPair(): { publicJwk: string; privateJwk: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicJwk: JSON.stringify(publicKey.export({ format: "jwk" })),
    privateJwk: JSON.stringify(privateKey.export({ format: "jwk" })),
  };
}
if (!process.env.E2E_TICKET_PRIVATE_JWK) {
  const ticket = jwkPair(); // the identity service's pair: signs tickets, Hub verifies
  const assertion = jwkPair(); // Hub's pair: Hub signs assertions, the identity service verifies
  process.env.E2E_TICKET_PRIVATE_JWK = ticket.privateJwk;
  process.env.E2E_TICKET_PUBLIC_JWK = ticket.publicJwk;
  process.env.E2E_ASSERTION_PRIVATE_JWK = assertion.privateJwk;
  process.env.E2E_ASSERTION_PUBLIC_JWK = assertion.publicJwk;
}

const HUB_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3001";
const IDENTITY_PORT = process.env.E2E_IDENTITY_PORT ?? "3901";
const APP_PORT = process.env.E2E_APP_PORT ?? "3902";
process.env.E2E_HUB_URL = HUB_URL;
process.env.E2E_IDENTITY_PORT = IDENTITY_PORT;
process.env.E2E_APP_PORT = APP_PORT;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: require.resolve("./e2e/global-setup.ts"),
  // One worker: the stub's mode and log are shared state.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "html",
  use: {
    baseURL: HUB_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
      // The canary asserts Chromium's form-action-on-redirects behaviour; Firefox doesn't enforce it that way.
      grepInvert: /@chromium-only/,
    },
  ],
  webServer: [
    {
      command: "pnpm dev",
      cwd: __dirname,
      url: `${HUB_URL}/sign-in`,
      // Always a fresh Hub: it has to carry this run's keys.
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        HUB_IDENTITY_TICKET_PUBLIC_JWK: process.env.E2E_TICKET_PUBLIC_JWK ?? "",
        HUB_OIDC_ASSERTION_PRIVATE_JWK:
          process.env.E2E_ASSERTION_PRIVATE_JWK ?? "",
        IDENTITY_ISSUER_URL: `http://localhost:${IDENTITY_PORT}`,
      },
    },
    {
      command: "pnpm exec tsx e2e/stubs/identity.ts",
      cwd: __dirname,
      url: `http://localhost:${IDENTITY_PORT}/__log`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        E2E_TICKET_PRIVATE_JWK: process.env.E2E_TICKET_PRIVATE_JWK ?? "",
        E2E_ASSERTION_PUBLIC_JWK: process.env.E2E_ASSERTION_PUBLIC_JWK ?? "",
      },
    },
  ],
});
