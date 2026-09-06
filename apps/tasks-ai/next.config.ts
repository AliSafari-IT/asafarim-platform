import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security/headers";

// Next.js only reads .env from the app directory; the platform keeps one
// shared .env at the monorepo root (NEXT_PUBLIC_* cross-app URLs and the
// TasksAI database URL).
loadEnv({ path: path.join(process.cwd(), "../../.env.local") });
loadEnv({ path: path.join(process.cwd(), "../../.env") });

const appRoot = path.dirname(fileURLToPath(import.meta.url));

// Security headers / CSP (docs/security-privacy.md). Built from
// lib/security/headers so the policy is unit-tested in one place.
const providerConnect = [
  process.env.NEXT_PUBLIC_HUB_URL,
  "https://api.anthropic.com",
  "https://api.openai.com",
]
  .filter((u): u is string => Boolean(u))
  .map((u) => (u.startsWith("http") ? new URL(u).origin : u));

const nextConfig: NextConfig = {
  output: process.env.BUILD_STANDALONE === "true" ? "standalone" : undefined,
  turbopack: { root: path.resolve(appRoot, "../..") },
  transpilePackages: ["@asafarim/ui", "@asafarim/theme-toggle"],
  devIndicators: false,
  poweredByHeader: false,
  async headers() {
    const headers = securityHeaders({
      connectSrc: providerConnect,
      reportOnly: process.env.TASKSAI_CSP_REPORT_ONLY === "true",
    });
    return [
      {
        source: "/:path*",
        headers: Object.entries(headers).map(([key, value]) => ({ key, value })),
      },
    ];
  },
};

export default nextConfig;
