#!/usr/bin/env tsx
/**
 * Runs the CI checks that don't require any decrypted secrets (lint,
 * typecheck, package tests), and writes a JSON summary plus a checksum so
 * the result is traceable to the exact commit and run that produced it.
 *
 * `build` is intentionally NOT run here yet — a full monorepo build needs
 * decrypted DB/auth secrets in CI, which is an infra decision (exposing the
 * age key as a GitHub secret) tracked separately, not something this script
 * should assume. See docs/proof-board-plan.md.
 *
 * Used by .github/workflows/ci-status.yml. Also runnable locally:
 *   pnpm tsx scripts/ci-status-summary.mts
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

interface CheckResult {
  name: string;
  command: string;
  status: "pass" | "fail";
  durationMs: number;
}

const CHECKS: Array<{ name: string; command: string }> = [
  { name: "lint", command: "pnpm turbo lint" },
  { name: "typecheck", command: "pnpm turbo typecheck" },
  { name: "test", command: "pnpm turbo test --filter=./packages/*" },
];

function run(command: string): CheckResult {
  const started = Date.now();
  let status: CheckResult["status"] = "pass";
  try {
    execSync(command, { stdio: "inherit" });
  } catch {
    status = "fail";
  }
  return { name: command, command, status, durationMs: Date.now() - started };
}

function sha(commandOutput: string): string {
  return createHash("sha256").update(commandOutput).digest("hex");
}

function main() {
  const commitSha = process.env.GITHUB_SHA ?? execSync("git rev-parse HEAD").toString().trim();
  const branch =
    process.env.GITHUB_REF_NAME ?? execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
  const measuredAt = new Date().toISOString();

  const results: CheckResult[] = CHECKS.map(({ name, command }) => {
    const result = run(command);
    return { ...result, name };
  });

  const summary = {
    commitSha,
    branch,
    measuredAt,
    method: "turbo lint && turbo typecheck && turbo test --filter=./packages/* (build excluded — needs CI secrets, tracked separately)",
    checks: results,
    overall: results.every((r) => r.status === "pass") ? "pass" : "fail",
  };

  const json = JSON.stringify(summary, null, 2);
  const checksum = sha(json);

  const outDir = path.resolve(process.cwd(), "ci-status-artifact");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "ci-status.json"), json + "\n");
  writeFileSync(path.join(outDir, "ci-status.json.sha256"), `${checksum}  ci-status.json\n`);

  console.log(json);
  console.log(`sha256: ${checksum}`);

  if (summary.overall === "fail") {
    process.exitCode = 1;
  }
}

main();
