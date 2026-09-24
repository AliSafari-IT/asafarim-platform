import path from "node:path";
import { defineConfig } from "vitest/config";

// Integration tests. Each *.integration.test.ts guards itself behind
// RESUMATCH_TEST_DATABASE_URL (a throwaway database, never the dev one) and
// is skipped — not failed — when it is unset, so `pnpm test:integration` is
// safe to run anywhere.
export default defineConfig({
  // tsconfig sets "jsx": "preserve" for Next; tests that render a
  // component (lib/costs/format.test.ts) need an actual JSX transform.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "./vitest.server-only-stub.ts"),
      // tsconfig's "@/*" path alias, used by a few route handlers.
      "@": path.resolve(__dirname),
    },
  },
  test: {
    include: ["lib/**/*.integration.test.ts", "app/**/*.integration.test.ts"],
    exclude: ["**/node_modules/**"],
    environment: "node",
    testTimeout: 30_000,
    fileParallelism: false,
    // next-auth imports "next/server" without an extension, which Node ESM
    // cannot resolve on its own; inlining lets Vite resolve it.
    server: { deps: { inline: ["next-auth"] } },
  },
});
