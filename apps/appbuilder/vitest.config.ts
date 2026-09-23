import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig.json sets "jsx": "preserve" (correct for Next's own SWC-based
  // build — Next does its own JSX transform, tsc only type-checks). Vitest 4
  // transforms through Vite 8's Oxc (the old `esbuild` option is deprecated
  // and ignored), which needs an explicit JSX runtime — without it, JSX in
  // any .test.tsx here is left untransformed and fails to parse.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
  },
});
