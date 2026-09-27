import { describe, expect, it } from "vitest";
import type { ToolDefinition } from "./types";
import { validateCatalogue } from "./validate";

const opts = { today: "2026-09-27", knownSlugs: ["alpha", "beta-tool"] };

function tool(overrides: Partial<ToolDefinition> & { slug?: string } = {}): ToolDefinition {
  return {
    slug: "alpha",
    title: "Turn requirements into a test plan",
    shortDescription: "Short.",
    longDescription: "Long.",
    category: "testing",
    lifecycle: "beta",
    indexable: true,
    inputSummary: "Requirements.",
    outputSummary: "A test plan.",
    capabilities: ["structured-output"],
    example: { label: "Load example", input: "An example requirement that is long enough.", output: { ok: true } },
    limits: { minInputChars: 10, maxInputChars: 1000 },
    limitations: ["Can miss edge cases."],
    privacyStatement: "We don't keep your text.",
    lastReviewed: "2026-09-01",
    ...overrides,
  } as ToolDefinition;
}

const both = (a: Partial<ToolDefinition> = {}, b: Partial<ToolDefinition> = {}) => [
  tool(a),
  tool({ slug: "beta-tool" as ToolDefinition["slug"], ...b }),
];

describe("validateCatalogue", () => {
  it("accepts a valid catalogue", () => {
    expect(validateCatalogue(both(), opts)).toEqual([]);
  });

  it("rejects duplicate slugs and slugs missing from TOOL_SLUGS", () => {
    const problems = validateCatalogue([tool(), tool(), tool({ slug: "gamma" as ToolDefinition["slug"] })], opts);
    expect(problems).toContain('tool "alpha": duplicate slug');
    expect(problems).toContain('tool "gamma": slug is not listed in TOOL_SLUGS');
    expect(problems).toContain('slug "beta-tool" is in TOOL_SLUGS but has no catalogue entry');
  });

  it("rejects missing fixtures and fixtures outside the tool's own limits", () => {
    expect(validateCatalogue(both({ example: { label: "x", input: "", output: {} } }), opts).join()).toMatch(
      /missing example fixture input/
    );
    expect(
      validateCatalogue(both({ example: { label: "x", input: "An adequate example input.", output: undefined } }), opts).join()
    ).toMatch(/missing example fixture output/);
    expect(validateCatalogue(both({ example: { label: "x", input: "short", output: {} } }), opts).join()).toMatch(
      /example input must satisfy/
    );
  });

  it.each([
    ["experiment", true],
    ["retired", true],
    ["beta", false],
    ["stable", false],
    ["paused", false],
  ] as const)("rejects lifecycle %s with indexable: %s", (lifecycle, indexable) => {
    const problems = validateCatalogue(both({ lifecycle, indexable, caseStudyPath: "/cs" }), opts);
    expect(problems.join()).toMatch(new RegExp(`lifecycle "${lifecycle}" must have indexable`));
  });

  it("requires internal tools to be unfeatured, non-indexable experiments", () => {
    const problems = validateCatalogue(both({ internal: true, featuredOrder: 1 }), opts).join();
    expect(problems).toMatch(/internal tools must be experiment and not indexable/);
    expect(problems).toMatch(/internal tools cannot be featured/);
  });

  it("requires a case study before a tool is stable", () => {
    expect(validateCatalogue(both({ lifecycle: "stable" }), opts).join()).toMatch(/stable tools require a published case study/);
  });

  it("rejects missing privacy and limitation content", () => {
    const problems = validateCatalogue(both({ privacyStatement: "  ", limitations: [] }), opts).join();
    expect(problems).toMatch(/missing privacyStatement/);
    expect(problems).toMatch(/at least one non-empty limitation/);
  });

  it("rejects bad limits, dates, links, and featured-order clashes", () => {
    const problems = validateCatalogue(
      both(
        { limits: { minInputChars: 10, maxInputChars: 5 }, lastReviewed: "2027-01-01", caseStudyPath: "https://x" },
        { featuredOrder: 1 }
      ).map((t, i) => (i === 0 ? { ...t, featuredOrder: 1 } : t)),
      opts
    ).join();
    expect(problems).toMatch(/limits need/);
    expect(problems).toMatch(/lastReviewed cannot be in the future/);
    expect(problems).toMatch(/caseStudyPath must be a path/);
    expect(problems).toMatch(/featuredOrder 1 is also used by "alpha"/);
  });

  it("rejects non-serializable entries such as functions or components", () => {
    const problems = validateCatalogue(both({ example: { label: "x", input: "An adequate example input.", output: () => null } }), opts);
    expect(problems.join()).toMatch(/plain JSON-serializable data/);
  });
});
