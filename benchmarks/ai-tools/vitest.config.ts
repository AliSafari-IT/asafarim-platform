import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // The tools' server modules import the "server-only" guard; plain Node needs a stub.
      "server-only": path.resolve(__dirname, "../../apps/web/vitest.server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
