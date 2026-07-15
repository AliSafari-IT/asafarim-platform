import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

// Next.js only reads .env from the app directory; the platform keeps one
// shared .env at the monorepo root.
loadEnv({ path: path.join(process.cwd(), "../../.env.local") });
loadEnv({ path: path.join(process.cwd(), "../../.env") });

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@asafarim/auth", "@asafarim/db", "@asafarim/shared-i18n", "@asafarim/country-language-selector", "@asafarim/vionto-schemas"],
};

export default nextConfig;
