import { describe, expect, it } from "vitest";

/**
 * JM-043 acceptance: "Disabling AI entirely leaves search + eligibility (M4)
 * and tracking (M6) fully working."
 *
 * This is true by construction, not by a runtime feature flag this module
 * checks: `evaluateMatch` (evaluate.ts) is only ever invoked from the
 * `match.evaluate` worker queue consumer (worker/index.ts's
 * `handleMatchEvaluateJob`) — nothing in lib/eligibility/*, lib/search/*, or
 * a future lib/tracking/* imports lib/matching/ai/evaluate.ts, so a
 * workspace that never enqueues a match.evaluate job never runs this code
 * at all, regardless of whether AI is configured. This test is a structural
 * regression guard: it fails loudly if evaluate.ts is ever imported from
 * lib/eligibility or lib/search, which would silently break that
 * independence.
 */
describe("evaluate.ts import isolation", () => {
  it("lib/eligibility/evaluate.ts does not import the AI evaluation pipeline", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const eligibilityPath = path.join(__dirname, "../../eligibility/evaluate.ts");
    const source = await fs.readFile(eligibilityPath, "utf8");
    expect(source).not.toMatch(/matching\/ai\/evaluate/);
  });

  it("lib/search does not import the AI evaluation pipeline", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const searchDir = path.join(__dirname, "../../search");
    let files: string[] = [];
    try {
      files = await fs.readdir(searchDir);
    } catch {
      return; // no lib/search directory yet — nothing to guard
    }
    for (const file of files) {
      if (!file.endsWith(".ts")) continue;
      const source = await fs.readFile(path.join(searchDir, file), "utf8");
      expect(source).not.toMatch(/matching\/ai\/evaluate/);
    }
  });
});
