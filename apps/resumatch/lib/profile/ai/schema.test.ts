import { describe, expect, it } from "vitest";
import { parseRewriteOutput } from "./schema";

describe("rewrite output contract", () => {
  it("accepts a well-formed rewrite", () => {
    expect(parseRewriteOutput("A confident, concise summary.")).toBe("A confident, concise summary.");
  });

  it("rejects an empty rewrite as a failed call rather than blanking the summary", () => {
    expect(() => parseRewriteOutput("")).toThrow();
    expect(() => parseRewriteOutput("   ")).toThrow();
  });

  it("rejects a non-string response", () => {
    expect(() => parseRewriteOutput({ text: "not a plain string" })).toThrow();
  });
});
