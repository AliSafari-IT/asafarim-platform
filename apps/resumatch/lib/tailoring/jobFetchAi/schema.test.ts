import { describe, expect, it } from "vitest";
import { parseJobFetchOutput } from "./schema";

describe("job-fetch output contract", () => {
  it("accepts a well-formed extraction", () => {
    const output = parseJobFetchOutput({
      title: "Implementation Analyst",
      employer: "Kingfisher IT",
      rawText: "We are looking for an implementation analyst...",
    });
    expect(output.title).toBe("Implementation Analyst");
    expect(output.employer).toBe("Kingfisher IT");
  });

  it("allows null title/employer but requires non-empty rawText", () => {
    const output = parseJobFetchOutput({ title: null, employer: null, rawText: "Some job text." });
    expect(output.title).toBeNull();
    expect(output.employer).toBeNull();

    expect(() => parseJobFetchOutput({ title: null, employer: null, rawText: "" })).toThrow();
  });

  it("rejects an unknown top-level field outright", () => {
    expect(() =>
      parseJobFetchOutput({ title: null, employer: null, rawText: "text", extra: "not allowed" }),
    ).toThrow();
  });

  it("rejects a missing rawText field", () => {
    expect(() => parseJobFetchOutput({ title: "A role" })).toThrow();
  });
});
