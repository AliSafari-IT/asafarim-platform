import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

// Next.js only reads .env from the app directory; the platform keeps one
// shared .env at the monorepo root (NEXT_PUBLIC_* cross-app URLs and the
// ResuMatch database URL).
loadEnv({ path: path.join(process.cwd(), "../../.env.local") });
loadEnv({ path: path.join(process.cwd(), "../../.env") });

const appRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: process.env.BUILD_STANDALONE === "true" ? "standalone" : undefined,
  turbopack: { root: path.resolve(appRoot, "../..") },
  transpilePackages: ["@asafarim/ui", "@asafarim/theme-toggle", "@asafarim/auth", "@asafarim/db", "@asafarim/ai-cost-ledger"],
  devIndicators: false,
  experimental: {
    // The auth proxy (proxy.ts) runs on every route, and Next buffers at
    // most this much of a request body for it. The default 10 MB cut a
    // profile import (#942, up to 20 MB, lib/profile/exportImport.ts) short
    // before the route could read it. Each route still enforces its own
    // limit (CV uploads stay at 10 MB).
    proxyClientMaxBodySize: "22mb",
  },
  // playwright-core reads files the tracer cannot see (browsers.json via a
  // computed require), so the standalone build copied it half-complete and
  // every server-side PDF failed with MODULE_NOT_FOUND in production. The
  // route that launches Chromium gets the whole package.
  outputFileTracingIncludes: {
    "/api/tailor/\\[id\\]/pdfs": ["./node_modules/playwright-core/**/*"],
  },
};

export default nextConfig;
