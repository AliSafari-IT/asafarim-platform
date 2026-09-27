import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig sets "jsx": "preserve" for Next; component tests render with
  // react-dom/server and need an actual JSX transform.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    // No DOM: components are verified with renderToStaticMarkup under Node,
    // matching packages/ui.
    environment: "node",
    include: ["lib/**/*.test.{ts,tsx}", "components/**/*.test.{ts,tsx}", "app/**/*.test.{ts,tsx}"],
  },
});
