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

// Static security headers (docs/security-privacy.md). The Content-Security-
// Policy is NOT set here: it needs a fresh per-request nonce for Next.js to
// hydrate under `script-src 'nonce-…' 'strict-dynamic'`, which a static
// header can't carry. proxy.ts builds and emits the full CSP (from the same
// lib/security/headers builder) on every HTML response.
const nextConfig: NextConfig = {
  output: process.env.BUILD_STANDALONE === "true" ? "standalone" : undefined,
  turbopack: { root: path.resolve(appRoot, "../..") },
  transpilePackages: ["@asafarim/ui", "@asafarim/theme-toggle", "@asafarim/testora-tasksai-contract"],
  devIndicators: false,
  poweredByHeader: false,
  async headers() {
    const headers = securityHeaders({ omitCsp: true });
    return [
      {
        source: "/:path*",
        headers: Object.entries(headers).map(([key, value]) => ({ key, value })),
      },
    ];
  },
};

export default nextConfig;
