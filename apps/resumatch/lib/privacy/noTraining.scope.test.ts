import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * #933: review feedback is the candidate's own record, never model input or
 * training data. No prompt, provider or selection module may read the
 * feedback table, and nothing in the app exports it except the candidate's
 * own data-rights export. Cross-user learning would need code that reads
 * feedback outside one workspace; these checks fail the moment any appears.
 */

const LIB = join(__dirname, "..");
const APP = join(__dirname, "..", "..", "app");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "generated") return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const READS_FEEDBACK = /tailoringFeedback\s*\.\s*(findMany|findFirst|findUnique|findFirstOrThrow|findUniqueOrThrow|groupBy|aggregate|count)/;
const MODEL_INPUT_DIRS = ["tailoring/ai", "profile/ai", "applicationEmail/ai", "tailoring/selection", "evidence/prompt.ts", "extraction"];

const rel = (p: string) => relative(join(__dirname, "..", ".."), p).split("\\").join("/");

describe("feedback is never model input or shared (#933)", () => {
  it("no prompt, provider or selection module mentions review feedback", () => {
    const offenders = MODEL_INPUT_DIRS.flatMap((d) => {
      const path = join(LIB, d);
      return statSync(path).isDirectory() ? sourceFiles(path) : [path];
    })
      .filter((p) => /tailoringFeedback|TailoringFeedback|tailoring_feedback/.test(readFileSync(p, "utf8")))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("feedback is read only by the CV's own feedback route, the export and the sweep", () => {
    const readers = [...sourceFiles(LIB), ...sourceFiles(APP)]
      .filter((p) => READS_FEEDBACK.test(readFileSync(p, "utf8")))
      .map(rel)
      .sort();
    expect(readers).toEqual(
      ["app/api/tailor/[id]/feedback/route.ts", "lib/privacy/retention.ts", "lib/profile/dataRights.ts"].sort(),
    );
  });
});
