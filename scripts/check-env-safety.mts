#!/usr/bin/env tsx
import { execFileSync } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { getEnvStatus, loadConfig, type EnvStatus } from "@asafarim/envage";

function gitFiles(root: string, args: string[]): string[] {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" })
      .split(/\r?\n/)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function isSensitivePlaintext(file: string): boolean {
  const normalized = file.replaceAll("\\", "/");
  const base = path.posix.basename(normalized);

  if (normalized === ".age/key.txt" || normalized.endsWith("/.age/key.txt")) {
    return true;
  }

  if (!base.startsWith(".env") || base.endsWith(".age")) return false;
  if (base.endsWith(".example") || base.endsWith(".template")) return false;
  return true;
}

async function main(): Promise<void> {
  const root = process.cwd();
  const config = await loadConfig(root);
  const statuses: EnvStatus[] = await getEnvStatus(config);
  const failures: string[] = [];
  const warnings: string[] = [];

  const local = statuses.find(
    (entry) => path.resolve(entry.folder) === root && entry.env === "root",
  );

  if (!local?.encrypted) {
    failures.push("The root environment is not encrypted (.env.age is missing).");
  }

  const production = statuses.find(
    (entry) => path.resolve(entry.folder) === root && entry.env === "production",
  );

  if (!production?.encrypted) {
    warnings.push(
      "Production is not encrypted yet; create .env.production and run pnpm env:encrypt:production.",
    );
  }

  try {
    await access(path.join(root, config.keyPubFile ?? ".age/key.pub"));
  } catch {
    failures.push("The committed public age key is missing (.age/key.pub).");
  }

  const trackedSensitive = gitFiles(root, ["ls-files"]).filter(isSensitivePlaintext);
  const stagedSensitive = gitFiles(root, ["diff", "--cached", "--name-only"]).filter(
    isSensitivePlaintext,
  );

  if (trackedSensitive.length > 0) {
    failures.push(`Sensitive plaintext is tracked: ${trackedSensitive.join(", ")}`);
  }

  if (stagedSensitive.length > 0) {
    failures.push(`Sensitive plaintext is staged: ${stagedSensitive.join(", ")}`);
  }

  for (const warning of warnings) console.warn(`warning: ${warning}`);

  if (failures.length > 0) {
    for (const failure of failures) console.error(`error: ${failure}`);
    process.exitCode = 1;
  } else {
    console.log("Environment safety checks passed.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
