import path from "node:path";
import { defineConfig } from "vitest/config";

// Integration tests. These require a throwaway TasksAI database supplied via
// TASKSAI_TEST_DATABASE_URL. They are skipped (not failed) when that is
// unset — see lib/db/test-database.ts — so `pnpm test:integration` is safe
// to run anywhere, and CI provides an ephemeral Postgres.
export default defineConfig({
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "./vitest.server-only-stub.ts"),
    },
  },
  test: {
    include: ["lib/**/*.integration.test.ts", "worker/**/*.integration.test.ts"],
    exclude: ["**/node_modules/**"],
    environment: "node",
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
