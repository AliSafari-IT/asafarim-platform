import { describe, expect, it } from "vitest";
import { isReservedSlug, slugify, validateCreateAppInput } from "./createApp";

describe("slugify", () => {
  it("lowercases and hyphenates a display name", () => {
    expect(slugify("My Great App")).toBe("my-great-app");
  });

  it("strips punctuation and collapses repeats", () => {
    expect(slugify("  Hello!!  World??  ")).toBe("hello-world");
  });

  it("falls back to a safe non-empty slug", () => {
    expect(slugify("!!!")).toBe("app");
  });
});

describe("isReservedSlug", () => {
  it("rejects route-colliding slugs", () => {
    expect(isReservedSlug("new")).toBe(true);
    expect(isReservedSlug("apps")).toBe(true);
    expect(isReservedSlug("api")).toBe(true);
  });

  it("rejects specification-engine reserved names", () => {
    expect(isReservedSlug("select")).toBe(true);
    expect(isReservedSlug("delete")).toBe(true);
  });

  it("accepts an ordinary slug", () => {
    expect(isReservedSlug("my-great-app")).toBe(false);
  });
});

const VALID_INPUT = {
  name: "Field Ops Tracker",
  prompt: "Track field technicians, jobs, and customer sites for a small HVAC company.",
  starterFamily: "task_management",
  visibility: "private",
};

describe("validateCreateAppInput", () => {
  it("accepts a valid submission", () => {
    const result = validateCreateAppInput(VALID_INPUT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.name).toBe("Field Ops Tracker");
      expect(result.data.starterFamily).toBe("task_management");
    }
  });

  it("normalizes internal whitespace in name and prompt", () => {
    const result = validateCreateAppInput({
      ...VALID_INPUT,
      name: "  Field   Ops   Tracker  ",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.name).toBe("Field Ops Tracker");
  });

  it("rejects a name that is too short", () => {
    const result = validateCreateAppInput({ ...VALID_INPUT, name: "A" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.name).toBeDefined();
  });

  it("rejects a name over the max length", () => {
    const result = validateCreateAppInput({ ...VALID_INPUT, name: "x".repeat(200) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.name).toBeDefined();
  });

  it("rejects a prompt that is too short", () => {
    const result = validateCreateAppInput({ ...VALID_INPUT, prompt: "short" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.prompt).toBeDefined();
  });

  it("rejects a reserved name", () => {
    const result = validateCreateAppInput({ ...VALID_INPUT, name: "New" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.name).toBeDefined();
  });

  it("rejects an unknown starter family", () => {
    const result = validateCreateAppInput({ ...VALID_INPUT, starterFamily: "made-up" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.starterFamily).toBeDefined();
  });

  it("rejects an unknown visibility", () => {
    const result = validateCreateAppInput({ ...VALID_INPUT, visibility: "public" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.visibility).toBeDefined();
  });

  it("rejects markup-looking input", () => {
    const result = validateCreateAppInput({ ...VALID_INPUT, name: "<script>alert(1)</script>" });
    expect(result.ok).toBe(false);
  });

  it("echoes back non-sensitive input on failure", () => {
    const result = validateCreateAppInput({ ...VALID_INPUT, name: "A" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.values.name).toBe("A");
      expect(result.values.prompt).toBe(VALID_INPUT.prompt);
    }
  });

  it("handles completely missing/garbage input without throwing", () => {
    const result = validateCreateAppInput(null);
    expect(result.ok).toBe(false);
    const result2 = validateCreateAppInput("not an object");
    expect(result2.ok).toBe(false);
  });
});
