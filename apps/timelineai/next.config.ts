import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

loadEnv({ path: path.join(process.cwd(), "../../.env.local") });
loadEnv({ path: path.join(process.cwd(), "../../.env") });

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: process.env.BUILD_STANDALONE === "true" ? "standalone" : undefined,
  basePath,
  transpilePackages: ["@asafarim/auth", "@asafarim/db", "@asafarim/storage", "@asafarim/ui"],
  outputFileTracingIncludes: {
    "**/*": [
      "../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/*.node",
      "../../node_modules/.pnpm/@prisma+client*/node_modules/@prisma/client/**",
      "../../node_modules/.prisma/client/*.node",
    ],
  },
  // Public timeline images may come from user-supplied URLs (validated and
  // proxied server-side — see lib/server/images.ts); keep remote patterns
  // wide open only for our own storage domain plus the export renderer.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
