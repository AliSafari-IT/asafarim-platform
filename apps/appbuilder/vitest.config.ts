import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig.json sets "jsx": "preserve" (correct for Next's own SWC-based
  // build — Next does its own JSX transform, tsc only type-checks). Vitest
  // runs through esbuild directly, which needs an explicit jsx mode of its
  // own since it never reads "preserve" as "use the automatic runtime" —
  // without this, any .test.tsx here fails at runtime with "React is not
  // defined" (esbuild silently falling back to the classic transform).
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
  },
});
