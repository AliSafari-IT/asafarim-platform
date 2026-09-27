import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig sets "jsx": "preserve" for Next; component tests render with
  // react-dom/server and need an actual JSX transform.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      // Next resolves the "server-only" guard itself; plain Node under vitest
      // needs a stub.
      "server-only": path.resolve(__dirname, "./vitest.server-only-stub.ts"),
    },
  },
  test: {
    // No DOM: components are verified with renderToStaticMarkup under Node,
    // matching packages/ui.
    environment: "node",
    include: ["lib/**/*.test.{ts,tsx}", "components/**/*.test.{ts,tsx}", "app/**/*.test.{ts,tsx}"],
  },
});
