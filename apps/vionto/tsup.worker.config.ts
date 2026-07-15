import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["worker.ts"],
  outDir: "worker-dist",
  format: ["cjs"],
  splitting: false,
  // Keep native/heavy deps external — installed separately in the runner image
  external: [
    "@prisma/client",
    "bullmq",
    "ioredis",
    "openai",
    "@aws-sdk/client-s3",
    "@aws-sdk/s3-request-presigner",
  ],
  // Force-inline all workspace packages (they are source-only TS, not published)
  noExternal: [
    "@asafarim/db",
    "@asafarim/auth",
    "@asafarim/vionto-schemas",
  ],
});
