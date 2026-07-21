import { defineConfig } from "vitest/config";

// Separate config so `pnpm test` (unit only, CI-safe without a database)
// and `pnpm test:integration` (requires appbuilder-postgres reachable at
// APPBUILDER_DATABASE_URL) stay independent.
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.integration.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    fileParallelism: false,
  },
});
