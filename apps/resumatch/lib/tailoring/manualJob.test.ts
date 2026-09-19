import { describe, expect, it } from "vitest";
import { buildManualJobText, manualJobInputSchema } from "./manualJob";

function baseInput(overrides: Record<string, unknown> = {}) {
  return manualJobInputSchema.parse({
    title: "Senior Backend Engineer",
    employer: "Acme Corp",
    requirements: "5+ years with Node.js and PostgreSQL.",
    ...overrides,
  });
}

describe("manualJobInputSchema", () => {
  it("accepts a minimal entry with just title, employer, and one content field", () => {
    const parsed = baseInput();
    expect(parsed.title).toBe("Senior Backend Engineer");
    expect(parsed.location).toBeNull();
  });

  it("rejects an entry with no content field at all", () => {
    expect(() =>
      manualJobInputSchema.parse({ title: "Engineer", employer: "Acme" }),
    ).toThrow();
  });

  it("rejects a missing title", () => {
    expect(() => manualJobInputSchema.parse({ employer: "Acme", requirements: "Some text" })).toThrow();
  });

  it("normalizes empty-string optional fields to null", () => {
    const parsed = baseInput({ location: "" });
    expect(parsed.location).toBeNull();
  });

  it("rejects an invalid work mode enum value", () => {
    expect(() => baseInput({ workMode: "flexible" })).toThrow();
  });
});

describe("buildManualJobText", () => {
  it("includes title, employer, and requirements", () => {
    const text = buildManualJobText(baseInput());
    expect(text).toContain("Senior Backend Engineer — Acme Corp");
    expect(text).toContain("Requirements:");
    expect(text).toContain("5+ years with Node.js and PostgreSQL.");
  });

  it("includes location and work mode facts on one line", () => {
    const text = buildManualJobText(baseInput({ location: "Brussels", workMode: "hybrid" }));
    expect(text).toContain("Brussels · Hybrid");
  });

  it("formats a salary range with currency", () => {
    const text = buildManualJobText(baseInput({ salaryMin: 60000, salaryMax: 75000, salaryCurrency: "EUR" }));
    expect(text).toContain("Salary: EUR 60000–75000");
  });

  it("omits sections that were not provided", () => {
    const text = buildManualJobText(baseInput());
    expect(text).not.toContain("Preferred qualifications:");
    expect(text).not.toContain("Benefits:");
    expect(text).not.toContain("Salary:");
  });
});
