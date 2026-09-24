import path from "node:path";
import { defineConfig } from "vitest/config";

// Separate config so `pnpm test` (unit only, database-free) and
// `pnpm test:integration` (requires RESUMATCH_TEST_DATABASE_URL — never
// the dev database, see docs/threat-model.md) stay independent. The
// default vitest.config.ts excludes `**/*.integration.test.ts` so `pnpm
// test` never touches a database; this config flips that around to
// include only the integration suites.
export default defineConfig({
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "./vitest.server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: [
      "lib/**/*.integration.test.ts",
      "app/**/*.integration.test.ts",
      "worker/**/*.integration.test.ts",
    ],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
