import { describe, expect, it } from "vitest";
import { toolWorkbenches } from "../../app/tools/[slug]/workbenches";
import { toolCatalogue } from "../../content/tools";
const referenceTool = toolCatalogue.find((t) => t.slug === "shell-reference")!;
import { getListedTools, getRoutableTools, getTool } from "./catalogue";
import { buildToolMetadata } from "./metadata";
import { TOOL_SLUGS } from "./types";
import { validateCatalogue } from "./validate";

describe("the real catalogue", () => {
  it("is valid", () => {
    expect(validateCatalogue(toolCatalogue)).toEqual([]);
  });

  it("has a workbench for every slug", () => {
    expect(Object.keys(toolWorkbenches).sort()).toEqual([...TOOL_SLUGS].sort());
  });

  it("contains no prompt or secret-looking fields", () => {
    const json = JSON.stringify(toolCatalogue).toLowerCase();
    for (const banned of ['"prompt"', '"system"', "api_key", "apikey", "sk-"]) {
      expect(json).not.toContain(banned);
    }
  });
});

describe("routing and listing", () => {
  it("routes the internal reference tool outside production only", () => {
    expect(getTool("shell-reference", { nodeEnv: "development" })?.slug).toBe("shell-reference");
    expect(getTool("shell-reference", { nodeEnv: "test" })).toBeDefined();
    expect(getTool("shell-reference", { nodeEnv: "production" })).toBeUndefined();
    expect(getRoutableTools({ nodeEnv: "production" }).some((t) => t.internal)).toBe(false);
  });

  it("returns undefined for unknown slugs", () => {
    expect(getTool("../../etc/passwd", { nodeEnv: "development" })).toBeUndefined();
    expect(getTool("constructor", { nodeEnv: "development" })).toBeUndefined();
  });

  it("never lists internal or retired tools", () => {
    expect(getListedTools().every((t) => !t.internal && t.lifecycle !== "retired")).toBe(true);
  });
});

describe("buildToolMetadata", () => {
  it("derives title, description, canonical, and noindex from the entry", () => {
    const tool = referenceTool;
    expect(buildToolMetadata(tool)).toEqual({
      title: tool.title,
      description: tool.shortDescription,
      alternates: { canonical: "/tools/shell-reference" },
      robots: { index: false, follow: true },
    });
  });

  it("omits robots for indexable tools", () => {
    const meta = buildToolMetadata({ ...referenceTool, lifecycle: "beta", indexable: true, internal: false });
    expect(meta.robots).toBeUndefined();
  });
});
