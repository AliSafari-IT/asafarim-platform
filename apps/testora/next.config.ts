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
  reactStrictMode: true,
  serverExternalPackages: ["testcafe", "testcafe-hammerhead", "@electron/asar"],
  devIndicators: false,
};

export default nextConfig;
