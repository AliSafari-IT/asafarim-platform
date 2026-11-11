import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // tsconfig says jsx: "preserve" (Next compiles it); tests that render
  // components (users/columns.test.ts) need it compiled here.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
  test: {
    environment: "node",
    include: ["**/__tests__/**/*.test.ts", "**/*.test.ts"],
    exclude: ["node_modules", ".next"],
  },
});
