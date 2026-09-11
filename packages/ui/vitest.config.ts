import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // No DOM needed — components are verified via react-dom/server's
    // renderToStaticMarkup, which runs fine under plain Node.
    environment: "node",
    include: ["src/**/*.test.tsx", "src/**/*.test.ts"],
  },
});
