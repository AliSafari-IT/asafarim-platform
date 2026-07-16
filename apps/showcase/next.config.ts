import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

// Next.js only reads .env from the app directory; the platform keeps one
// shared .env at the monorepo root (NEXT_PUBLIC_* cross-app URLs).
loadEnv({ path: path.join(process.cwd(), "../../.env.local") });
loadEnv({ path: path.join(process.cwd(), "../../.env") });

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@asafarim/ui", "@asafarim/shared-i18n", "@asafarim/country-language-selector"],
  // Hide the floating Next.js dev-tools indicator (dev-only overlay).
  devIndicators: false,
};

export default nextConfig;
