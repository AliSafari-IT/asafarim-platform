import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // The integration suite (skipped unless SEED_MANAGER_TEST_DATABASE_URL is
    // set) seeds and removes whole datasets, which is well past the 5s default.
    testTimeout: 120_000,
    hookTimeout: 60_000,
    // Providers share one database; running files in parallel would make them
    // fight over the same seed rows.
    fileParallelism: false,
  },
});
