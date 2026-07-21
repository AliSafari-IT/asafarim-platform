import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

// Next.js only reads .env from the app directory; the platform keeps one
// shared .env at the monorepo root.
loadEnv({ path: path.join(process.cwd(), "../../.env.local") });
loadEnv({ path: path.join(process.cwd(), "../../.env") });

const nextConfig: NextConfig = {
  // Docker builds set BUILD_STANDALONE=true to emit a self-contained server.
  output: process.env.BUILD_STANDALONE === "true" ? "standalone" : undefined,
  reactStrictMode: true,
  // Workspace TS packages ship source, not a build — Next must transpile them.
  transpilePackages: ["@asafarim/ui", "@asafarim/auth", "@asafarim/appbuilder-schema", "@asafarim/theme-toggle"],
  // Hide the floating Next.js dev-tools indicator (dev-only overlay).
  devIndicators: false,
};

export default nextConfig;
