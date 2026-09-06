import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // vitest runs in a plain Node context, not the Next.js module graph,
      // so the "server-only" import guard throws unless stubbed here.
      "server-only": path.resolve(__dirname, "./vitest.server-only-stub.ts"),
    },
  },
  test: {
    // Unit tests only. Anything needing a live TasksAI database belongs in
    // a *.integration.test.ts file behind TASKSAI_TEST_DATABASE_URL — the
    // dev database must never be a test target (see the AppBuilder incident
    // recorded across the platform).
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "worker/**/*.test.ts", "evals/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
    environment: "node",
  },
});
