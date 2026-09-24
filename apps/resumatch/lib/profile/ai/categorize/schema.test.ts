import { describe, expect, it } from "vitest";
import { mergeSuggestedCategories, parseCategorizeOutput } from "./schema";

describe("parseCategorizeOutput", () => {
  it("accepts a well-formed response", () => {
    const result = parseCategorizeOutput({
      categories: [
        { name: "React", category: "Frontend Development" },
        { name: "Grant Writing", category: "Fundraising" },
      ],
    });
    expect(result).toEqual([
      { name: "React", category: "Frontend Development" },
      { name: "Grant Writing", category: "Fundraising" },
    ]);
  });

  it("rejects a response missing the categories array", () => {
    expect(() => parseCategorizeOutput({})).toThrow();
  });

  it("rejects an entry missing a name or category", () => {
    expect(() => parseCategorizeOutput({ categories: [{ name: "React" }] })).toThrow();
    expect(() => parseCategorizeOutput({ categories: [{ category: "Frontend" }] })).toThrow();
  });
});

describe("mergeSuggestedCategories — no-fabrication guarantee", () => {
  it("only applies a suggestion whose name exactly matches one of the candidate's own skills", () => {
    const merged = mergeSuggestedCategories(
      ["React", "Node.js"],
      [
        { name: "React", category: "Frontend Development" },
        { name: "Node.js", category: "Backend & APIs" },
      ],
    );
    expect(merged.get("React")).toBe("Frontend Development");
    expect(merged.get("Node.js")).toBe("Backend & APIs");
    expect(merged.size).toBe(2);
  });

  it("drops a suggestion for a skill name the candidate does not have — never invents a new skill", () => {
    const merged = mergeSuggestedCategories(
      ["React"],
      [
        { name: "React", category: "Frontend Development" },
        { name: "Rust", category: "Systems Programming" }, // not in the candidate's list
      ],
    );
    expect(merged.has("Rust")).toBe(false);
    expect(merged.size).toBe(1);
  });

  it("is case-sensitive — a renamed-case name does not count as a match", () => {
    const merged = mergeSuggestedCategories(["React"], [{ name: "react", category: "Frontend Development" }]);
    expect(merged.size).toBe(0);
  });

  it("keeps the first suggestion when a name appears twice", () => {
    const merged = mergeSuggestedCategories(
      ["React"],
      [
        { name: "React", category: "Frontend Development" },
        { name: "React", category: "Something Else" },
      ],
    );
    expect(merged.get("React")).toBe("Frontend Development");
  });

  it("returns an empty map for an empty suggestion list", () => {
    expect(mergeSuggestedCategories(["React"], [])).toEqual(new Map());
  });
});
