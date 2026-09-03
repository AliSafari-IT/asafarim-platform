import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests only. Anything needing a live JobMatch database belongs in
    // a *.integration.test.ts file behind JOBMATCH_TEST_DATABASE_URL — the
    // dev database must never be a test target (see the AppBuilder incident
    // recorded in docs/threat-model.md).
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    // *.integration.test.ts also matches the includes above; excluding it
    // keeps `pnpm test` database-free, which is what makes it safe to run
    // anywhere.
    exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
    environment: "node",
  },
});
