import { describe, expect, it } from "vitest";
import { RewriteFixtureProvider } from "./fixture";

const provider = new RewriteFixtureProvider();

describe("RewriteFixtureProvider", () => {
  it("returns the candidate's own text unchanged, at zero cost", async () => {
    const output = await provider.rewrite({
      currentSummary: "Backend engineer who ships reliable systems.",
      tone: "confident",
      system: "system",
      user: "user",
      promptVersion: "rewrite_summary@1",
      model: "fixture-rewrite-1",
    });
    expect(output.text).toBe("Backend engineer who ships reliable systems.");
    expect(output.costUsd).toBe(0);
  });
});
