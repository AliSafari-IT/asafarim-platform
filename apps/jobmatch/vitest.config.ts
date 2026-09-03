import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests only. Anything needing a live JobMatch database belongs in
    // a *.integration.test.ts file behind JOBMATCH_TEST_DATABASE_URL — the
    // dev database must never be a test target (see the AppBuilder incident
    // recorded in docs/threat-model.md).
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    environment: "node",
  },
});
