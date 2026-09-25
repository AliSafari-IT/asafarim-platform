import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

// Next.js only reads .env from the app directory; the platform keeps one
// shared .env at the monorepo root. Load those first, then let an app-local
// .env.local (if present) override for testora-specific values.
loadEnv({ path: path.join(process.cwd(), "../../.env.local") });
loadEnv({ path: path.join(process.cwd(), "../../.env") });
loadEnv({ path: path.join(process.cwd(), ".env.local") });

const nextConfig: NextConfig = {
  // Docker builds set BUILD_STANDALONE=true to emit a self-contained server.
  output: process.env.BUILD_STANDALONE === "true" ? "standalone" : undefined,
  reactStrictMode: true,
  // Workspace TS packages ship source, not a build — Next must transpile them.
  transpilePackages: [
    "@asafarim/auth",
    "@asafarim/db",
    "@asafarim/storage",
    "@asafarim/theme-toggle",
    "@asafarim/ui",
    "@asafarim/testora-tasksai-contract",
  ],
  serverExternalPackages: ["testcafe", "testcafe-hammerhead", "@electron/asar"],
  // testcafe-hammerhead reads task.js.mustache off disk at runtime (not a
  // require()/import Next's file tracer can see), so the standalone Docker
  // build prunes it and every TestCafe run 500s in production with
  // "Failed to load external module ...: ENOENT ... task.js.mustache".
  // Force-include it so it survives the standalone output trace.
  outputFileTracingIncludes: {
    "/**": [
      "../../node_modules/.pnpm/testcafe-hammerhead@*/node_modules/testcafe-hammerhead/lib/client/*.mustache",
    ],
  },
  devIndicators: false,
};

export default nextConfig;
