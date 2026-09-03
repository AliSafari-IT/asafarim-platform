import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

// Next.js only reads .env from the app directory; the platform keeps one
// shared .env at the monorepo root (NEXT_PUBLIC_* cross-app URLs and the
// JobMatch database URL).
loadEnv({ path: path.join(process.cwd(), "../../.env.local") });
loadEnv({ path: path.join(process.cwd(), "../../.env") });

const appRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: process.env.BUILD_STANDALONE === "true" ? "standalone" : undefined,
  turbopack: { root: path.resolve(appRoot, "../..") },
  transpilePackages: ["@asafarim/ui", "@asafarim/theme-toggle"],
  devIndicators: false,
};

export default nextConfig;
