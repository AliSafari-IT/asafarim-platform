import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig sets "jsx": "preserve" for Next; tests that render a
  // component (lib/costs/format.test.ts) need an actual JSX transform.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      // vitest runs in a plain Node context, not the Next.js server/client
      // module graph, so the "server-only" import guard throws unless
      // stubbed out here.
      "server-only": path.resolve(__dirname, "./vitest.server-only-stub.ts"),
    },
  },
  test: {
    // Unit tests only. Anything needing a live ResuMatch database belongs in
    // a *.integration.test.ts file behind RESUMATCH_TEST_DATABASE_URL — the
    // dev database must never be a test target (see the AppBuilder incident
    // recorded in internal docs: ventures/resumatch/engineering/threat-model.md).
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "worker/**/*.test.ts", "evals/**/*.test.ts"],
    // *.integration.test.ts also matches the includes above; excluding it
    // keeps `pnpm test` database-free, which is what makes it safe to run
    // anywhere.
    exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
    environment: "node",
  },
});
