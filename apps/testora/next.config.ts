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
  serverExternalPackages: ["testcafe", "testcafe-hammerhead", "testcafe-browser-tools", "@electron/asar"],
  // TestCafe's runtime reads several non-JS files off disk (templates, device
  // definitions, native helper binaries) rather than require()/import-ing
  // them, so Next's file tracer can't see the reference and the standalone
  // Docker build prunes them — every run then 500s in production with
  // "Failed to load external module ...: ENOENT ...". This has already bitten
  // us twice for two different files in two different packages (issue #623:
  // testcafe-hammerhead's task.js.mustache, then testcafe-browser-tools'
  // data/devices.json) — rather than keep chasing individual files one
  // production incident at a time, force-include the whole package trees for
  // every package that reads its own non-code assets this way. Both are a few
  // MB; that's a fair trade for not shipping this bug a third time.
  outputFileTracingIncludes: {
    "/**": [
      "../../node_modules/.pnpm/testcafe-hammerhead@*/node_modules/testcafe-hammerhead/**",
      "../../node_modules/.pnpm/testcafe-browser-tools@*/node_modules/testcafe-browser-tools/**",
    ],
  },
  devIndicators: false,
};

export default nextConfig;
