#!/usr/bin/env node
/**
 * Regenerates apps/showcase/public-data/workspace.json — the proof board's
 * "shipped packages and apps" list — from real git history.
 *
 * Workspace packages are consumed via `workspace:*` and never published, so
 * their package.json semver is never bumped and says nothing about what is
 * actually deployed. The honest version of an internal package is the last
 * commit that touched its folder, so that is what this records, alongside
 * how much history sits behind it and how many workspaces depend on it.
 *
 * Needs full history (`fetch-depth: 0` in CI) — a shallow clone would
 * report every folder as one commit old. Only allow-listed fields are
 * written: name, description, folder, short SHA, date, counts.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const outPath = path.resolve("apps/showcase/public-data/workspace.json");
const GROUPS = [
  { dir: "packages", kind: "package" },
  { dir: "apps", kind: "app" },
];

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function readManifests() {
  const manifests = [];
  for (const group of GROUPS) {
    for (const entry of readdirSync(group.dir)) {
      const folder = `${group.dir}/${entry}`;
      try {
        const pkg = JSON.parse(readFileSync(path.join(folder, "package.json"), "utf8"));
        if (!pkg.name) continue;
        manifests.push({ folder, kind: group.kind, pkg });
      } catch {
        // no package.json — not a workspace
      }
    }
  }
  return manifests;
}

function main() {
  const manifests = readManifests();

  // name -> number of other workspaces that depend on it via workspace:*
  const dependents = new Map();
  for (const { pkg } of manifests) {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
    for (const [dep, range] of Object.entries(deps)) {
      if (String(range).startsWith("workspace:")) dependents.set(dep, (dependents.get(dep) ?? 0) + 1);
    }
  }

  const entries = manifests
    .map(({ folder, kind, pkg }) => {
      const [sha = "", date = ""] = git(["log", "-1", "--format=%h%x1f%ad", "--date=short", "--", folder]).split("\x1f");
      const firstDate = git(["log", "--reverse", "--format=%ad", "--date=short", "--", folder]).split("\n")[0] ?? "";
      const commits = Number(git(["rev-list", "--count", "HEAD", "--", folder])) || 0;
      return {
        name: pkg.name,
        kind,
        folder,
        description: typeof pkg.description === "string" ? pkg.description : "",
        sha,
        date,
        since: firstDate,
        commits,
        dependents: dependents.get(pkg.name) ?? 0,
      };
    })
    .filter((entry) => entry.sha)
    .sort((a, b) => a.name.localeCompare(b.name));

  // @asafarim/* packages this repo pulls from the npm registry rather than
  // from a local workspace — lets the proof board mark them "used here".
  const npmDependencies = new Set();
  for (const pkg of [JSON.parse(readFileSync("package.json", "utf8")), ...manifests.map((m) => m.pkg)]) {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [dep, range] of Object.entries(deps)) {
      if (dep.startsWith("@asafarim/") && !String(range).startsWith("workspace:")) npmDependencies.add(dep);
    }
  }

  const manifest = { workspaces: entries, npmDependencies: [...npmDependencies].sort() };
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Wrote ${entries.length} workspace entries to ${outPath}`);
}

main();
