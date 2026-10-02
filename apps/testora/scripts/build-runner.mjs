#!/usr/bin/env node
/**
 * Bundles the isolated runner (#718, ADR 0004 §5) for the testora-runner
 * image: src/runner/main.ts and job.ts become dist-runner/main.mjs and
 * job.mjs, with scenarioRunner.js (imported by generated specs at run time)
 * copied beside them. Everything is inlined except TestCafe, which the image
 * installs from runner-image/package-lock.json. No Next.js, no database
 * client, no workspace node_modules.
 *
 *   pnpm --filter testora build:runner
 */
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const appDir = path.resolve(import.meta.dirname, "..");
const outDir = path.join(appDir, "dist-runner");

// esbuild arrives through tsx (a devDependency); resolve it from there rather
// than adding a second copy to the workspace.
const require = createRequire(import.meta.url);
const esbuild = require(require.resolve("esbuild", { paths: [path.dirname(require.resolve("tsx"))] }));

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

await esbuild.build({
  absWorkingDir: appDir,
  entryPoints: { main: "src/runner/main.ts", job: "src/runner/job.ts" },
  outdir: outDir,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  external: ["testcafe"],
  // Bundled CommonJS dependencies (dotenv) call require(); give ESM one.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: "warning",
});

copyFileSync(
  path.join(appDir, "src", "test-engine", "executors", "scenarioRunner.js"),
  path.join(outDir, "scenarioRunner.js"),
);
// scenarioRunner.js is ESM, like the app it comes from.
writeFileSync(path.join(outDir, "package.json"), `${JSON.stringify({ type: "module" }, null, 2)}\n`);
console.log(`runner bundle → ${path.relative(process.cwd(), outDir)}`);
