import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Issue #513: the dedup cache is for CV extraction and AI job-fetch only.
 * Tailoring, cover letters and rewrite are fresh on every call by product
 * design (lib/tailoring/ai/generate.ts), so no file in those domains may
 * import the cache. This fails the moment one does.
 */

const LIB = join(__dirname, "..");
const FRESH_EVERY_TIME = ["tailoring/ai", "profile/ai"];
const ALLOWED_CONSUMERS = [
  "extraction/ai/degraded.ts",
  "tailoring/jobFetchAi/degraded.ts",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const importsCache = (path: string) =>
  /aiDedupCache/.test(readFileSync(path, "utf8"));

describe("aiDedupCache scope (issue #513)", () => {
  it.each(FRESH_EVERY_TIME)(
    "no file under lib/%s imports the dedup cache",
    (dir) => {
      const offenders = sourceFiles(join(LIB, dir))
        .filter(importsCache)
        .map((p) => relative(LIB, p));
      expect(offenders).toEqual([]);
    }
  );

  it("only extraction and job-fetch use it", () => {
    const consumers = sourceFiles(LIB)
      .filter((p) => !p.includes(`${join("shared", "aiDedupCache")}`))
      .filter(importsCache)
      .map((p) => relative(LIB, p).split("\\").join("/"))
      .sort();
    expect(consumers).toEqual([...ALLOWED_CONSUMERS].sort());
  });
});
