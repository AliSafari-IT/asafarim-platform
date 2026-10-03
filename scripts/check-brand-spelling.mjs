#!/usr/bin/env node
/**
 * Brand spelling guard (#778). The brand is spelled "ASafariM": capital A,
 * S and M, lower-case "afari". The old spelling (capital I) must not come back
 * in code, copy, docs or config. Technical ids (asafarim-os, @asafarim/*,
 * asafarim.site, ASAFARIM_*) aren't affected: the match is exact and
 * case-sensitive.
 *
 * Searches every tracked text file with `git grep` and fails with each hit.
 * The wrong spelling is assembled from two parts so this file never matches
 * itself.
 *
 *   node scripts/check-brand-spelling.mjs        (from the repo root)
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const WRONG = "ASafar" + "IM";
export const RIGHT = "ASafar" + "iM";

/** `file:line:text` for every tracked text file containing the wrong spelling. */
export function findWrongSpelling(cwd = process.cwd()) {
  try {
    const out = execFileSync("git", ["grep", "-n", "-I", "--fixed-strings", "-e", WRONG], { cwd, encoding: "utf8" });
    return out.split(/\r?\n/).filter(Boolean);
  } catch (error) {
    // git grep exits 1 when nothing matches.
    if (error && typeof error === "object" && "status" in error && error.status === 1) return [];
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const hits = findWrongSpelling();
  if (hits.length === 0) {
    console.log(`✔ Brand spelling: no "${WRONG}" in tracked files (it is "${RIGHT}").`);
  } else {
    console.error(`✖ ${hits.length} occurrence(s) of "${WRONG}". The brand is spelled "${RIGHT}" (#778):`);
    for (const hit of hits) console.error(`  ${hit}`);
    process.exit(1);
  }
}
