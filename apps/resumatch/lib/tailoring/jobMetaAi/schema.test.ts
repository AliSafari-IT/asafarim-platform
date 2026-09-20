import { describe, expect, it } from "vitest";
import { parseJobMetaOutput } from "./schema";

describe("parseJobMetaOutput", () => {
  it("accepts a well-formed response", () => {
    expect(parseJobMetaOutput({ title: "Backend Engineer", employer: "Acme Corp" })).toEqual({
      title: "Backend Engineer",
      employer: "Acme Corp",
    });
  });

  it("accepts nulls for both fields", () => {
    expect(parseJobMetaOutput({ title: null, employer: null })).toEqual({ title: null, employer: null });
  });

  it("defaults missing fields to null rather than rejecting them", () => {
    expect(parseJobMetaOutput({})).toEqual({ title: null, employer: null });
  });

  it("rejects an unlisted field outright", () => {
    expect(() => parseJobMetaOutput({ title: "X", employer: "Y", confidence: 0.9 })).toThrow();
  });

  it("rejects a title over the length cap", () => {
    expect(() => parseJobMetaOutput({ title: "x".repeat(301) })).toThrow();
  });
});
