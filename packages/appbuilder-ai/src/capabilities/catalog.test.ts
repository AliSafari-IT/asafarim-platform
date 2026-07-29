import { describe, it, expect } from "vitest";
import { buildCapabilityCatalog, describeCapabilityGaps } from "./catalog";

describe("buildCapabilityCatalog", () => {
  it("derives an entry for every allowlisted operation kind", () => {
    const catalog = buildCapabilityCatalog();
    const operationEntries = catalog.filter((e) => e.id.startsWith("operation."));
    expect(operationEntries.length).toBeGreaterThan(10);
    expect(operationEntries.every((e) => e.status === "supported_now")).toBe(true);
    expect(catalog.some((e) => e.id === "operation.UPDATE_BRANDING")).toBe(true);
  });

  it("marks known out-of-scope surfaces as unsupported", () => {
    const catalog = buildCapabilityCatalog();
    const animation = catalog.find((e) => e.id === "arbitrary_css_or_animation");
    expect(animation?.status).toBe("unsupported_schema");
    const github = catalog.find((e) => e.id === "github_reference_import");
    expect(github?.status).toBe("unsupported_flag");
  });

  it("labels multi-step requests as supported_as_plan", () => {
    const catalog = buildCapabilityCatalog();
    expect(catalog.find((e) => e.id === "multi_step_plan")?.status).toBe("supported_as_plan");
  });
});

describe("describeCapabilityGaps", () => {
  it("flags Framer Motion / animation requests", () => {
    const gaps = describeCapabilityGaps("add smooth Framer Motion animations throughout");
    expect(gaps.some((g) => g.classification === "schema" && g.requested.toLowerCase().includes("animation"))).toBe(true);
  });

  it("flags GitHub-sourced content requests", () => {
    const gaps = describeCapabilityGaps("pull my projects from GitHub");
    expect(gaps.some((g) => g.classification === "flag")).toBe(true);
  });

  it("flags script/code execution requests", () => {
    const gaps = describeCapabilityGaps("run a setup script on deploy");
    expect(gaps.some((g) => g.classification === "schema" && g.requested.includes("script"))).toBe(true);
  });

  it("returns no gaps for an ordinary representable request", () => {
    expect(describeCapabilityGaps("add a priority field to tasks")).toEqual([]);
  });
});
