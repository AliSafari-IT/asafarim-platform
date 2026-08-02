import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["worker.ts"],
  outDir: "worker-dist",
  format: ["cjs"],
  splitting: false,
  // apps/appbuilder's own tsconfig.json sets jsx:"preserve" (Next.js
  // expects its own bundler to transform JSX) — the worker is a plain Node
  // process with no Next bundler in front of it, so it needs the automatic
  // JSX runtime instead, or @asafarim/appbuilder-runtime's .tsx components
  // (pulled in transitively via requestPreviewBuild) fail at runtime with
  // "ReferenceError: React is not defined". See tsconfig.worker.json.
  tsconfig: "./tsconfig.worker.json",
  // Keep native/heavy deps external — installed separately in the runner image.
  // playwright-core/@axe-core/playwright back M10's browser-driven validation
  // gates (lib/validation/smoke/harness.ts) — the worker container must run
  // `npx playwright install --with-deps chromium` (see
  // docs/appbuilder-m10-validation-qa.md#operator-troubleshooting).
  // drizzle-orm/next-auth/react/zod are pure-JS deps that tsup would otherwise
  // bundle, but they're also pulled in by the bundled workspace packages
  // (e.g. @asafarim/auth → next-auth, @asafarim/ui → react); keeping them
  // external + installed in the runner avoids bundling duplicates and keeps
  // worker.js smaller. See apps/appbuilder/Dockerfile worker stage.
  external: [
    "bullmq",
    "ioredis",
    "openai",
    "pg",
    "playwright-core",
    "@axe-core/playwright",
    "drizzle-orm",
    "next-auth",
    "react",
    "zod",
  ],
  // Force-inline all workspace packages (they are source-only TS, not
  // published) — including transitive ones like @asafarim/ui (a dependency
  // of @asafarim/appbuilder-runtime's rendering registry) that would
  // otherwise be left as an unresolvable raw-.tsx `require()` at runtime.
  noExternal: [
    "@asafarim/appbuilder-ai",
    "@asafarim/appbuilder-runtime",
    "@asafarim/appbuilder-schema",
    "@asafarim/ui",
    "@asafarim/auth",
    "@asafarim/storage",
  ],
});
