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
  transpilePackages: ["@asafarim/auth", "@asafarim/db", "@asafarim/ui"],
  serverExternalPackages: ["testcafe", "testcafe-hammerhead", "@electron/asar"],
  devIndicators: false,
};

export default nextConfig;
