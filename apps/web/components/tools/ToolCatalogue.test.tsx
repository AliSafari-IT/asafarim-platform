import { renderToStaticMarkup } from "react-dom/server";
import { getServerTranslator } from "@asafarim/shared-i18n/server";
import { describe, expect, it } from "vitest";
import { toolCatalogue } from "../../content/tools";
import webDictionaries from "../../lib/i18n-dictionaries";
import type { ToolDefinition } from "../../lib/tools/types";
import { ToolCatalogue } from "./ToolCatalogue";

const en = getServerTranslator("en", webDictionaries);
const nl = getServerTranslator("nl-BE", webDictionaries);
const base = toolCatalogue[0];

function tool(slug: string, overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    ...base,
    slug: slug as ToolDefinition["slug"],
    title: `Title ${slug}`,
    internal: false,
    lifecycle: "beta",
    indexable: true,
    liveGeneration: true,
    ...overrides,
  };
}

const render = (tools: ToolDefinition[], t = en) => renderToStaticMarkup(<ToolCatalogue tools={tools} t={t} />);
const cards = (html: string) => html.split('<section class="ui-card').slice(1);

describe("ToolCatalogue — populated", () => {
  const tools = [
    tool("plan", { relatedApp: { key: "testora", name: "Testora", reason: "r" }, caseStudyPath: "/projects/ai-workbench#plan" }),
    tool("demo", { liveGeneration: false, lifecycle: "experiment", indexable: false, relatedApp: undefined }),
    tool("held", { lifecycle: "paused", liveGeneration: false, relatedApp: undefined }),
  ];
  const html = render(tools);

  it("renders cards in the order given by the registry", () => {
    const order = ["Title plan", "Title demo", "Title held"].map((t) => html.indexOf(t));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("gives each card exactly one primary action, with the tool name for screen readers", () => {
    for (const card of cards(html)) {
      expect(card.match(/ui-btn--primary/g)).toHaveLength(1);
    }
    expect(html).toMatch(/href="\/tools\/plan"[^>]*>Use tool<span[^>]*>: Title plan<\/span>/);
  });

  it("distinguishes runnable, example-only, and paused tools", () => {
    const [plan, demo, held] = cards(html);
    expect(plan).toContain('data-availability="live"');
    expect(plan).toContain("Runs on your text");
    expect(plan).toContain(">Beta<");
    expect(demo).toContain('data-availability="examples-only"');
    expect(demo).toContain("Examples only");
    expect(demo).toContain("Experimental");
    expect(held).toContain('data-availability="paused"');
    expect(held).toContain("Paused — examples only");
    expect(held).toContain(">View tool<");
    expect(held).not.toContain(">Use tool<");
  });

  it("shows privacy and sign-in facts on every card", () => {
    for (const card of cards(html)) expect(card).toContain("No sign-in · Your text isn&#x27;t stored");
  });

  it("adds full-app and case-study links as secondary text links only when present", () => {
    const [plan, demo] = cards(html);
    expect(plan).toMatch(/<a href="[^"]+">Continue in Testora<\/a>/);
    expect(plan).toMatch(/<a href="[^"]+\/projects\/ai-workbench#plan">How it&#x27;s built<\/a>/);
    expect(demo).not.toContain("Continue in");
    expect(demo).not.toContain("How it&#x27;s built");
  });

  it("uses only ordinary anchors with real hrefs", () => {
    const hrefs = [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const a of hrefs) {
      expect(a).toMatch(/href="(\/|https?:\/\/)[^"]+"/);
      expect(a).not.toMatch(/href="#"|javascript:|onclick/i);
    }
  });

  it("points to Labs for early experiments", () => {
    expect(html).toContain("Visit Labs");
  });
});

describe("ToolCatalogue — empty", () => {
  const html = render([]);

  it("renders an honest empty state with a Labs link instead of a grid", () => {
    expect(html).not.toContain('data-testid="tool-grid"');
    expect(html).toContain("The first tools are on their way");
    expect(html).toMatch(/<a href="[^"]+"[^>]*>Explore Labs<\/a>/);
  });

  it("still explains how the tools work", () => {
    expect(html).toContain("How these tools work");
    expect(html).toContain("You review everything");
  });
});

describe("ToolCatalogue — localized", () => {
  it("renders catalogue chrome from the Web dictionaries", () => {
    const html = render([tool("plan", { relatedApp: { key: "testora", name: "Testora", reason: "r" } })], nl);
    expect(html).toContain("Hoe deze tools werken");
    expect(html).toContain("Tool gebruiken");
    expect(html).toContain("Werkt met jouw tekst");
    expect(html).toContain("Verder in Testora");
    expect(html).toContain("Bèta");
  });
});
