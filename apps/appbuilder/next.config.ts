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
  transpilePackages: [
    "@asafarim/ui",
    "@asafarim/auth",
    "@asafarim/appbuilder-schema",
    "@asafarim/appbuilder-runtime",
    "@asafarim/theme-toggle",
  ],
  // Hide the floating Next.js dev-tools indicator (dev-only overlay).
  devIndicators: false,
  // M06: the generated-app preview route's actual Content-Security-Policy
  // (with a fresh per-request nonce, required for Next.js's own RSC
  // hydration scripts under a strict script-src) is set in proxy.ts, not
  // here — a static header here can't carry a per-request nonce. This adds
  // only the legacy X-Frame-Options fallback: `frame-ancestors 'self'` (in
  // proxy.ts's CSP) already allows same-origin framing for the future M08
  // builder workspace while blocking every other origin.
  async headers() {
    return [
      {
        source: "/apps/:appId/preview/:path*",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
    ];
  },
};

export default nextConfig;
