import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { toolCatalogue } from "../../content/tools";
import { ShellReferenceWorkbench } from "../../lib/tools/reference/ShellReferenceWorkbench";
import type { ToolDefinition } from "../../lib/tools/types";
import { ProvenanceBadge } from "./ProvenanceBadge";
import { ToolCard } from "./ToolCard";
import { ToolShell } from "./ToolShell";

const reference = toolCatalogue.find((t) => t.slug === "shell-reference")!;
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");

describe("ToolShell", () => {
  const html = renderToStaticMarkup(
    <ToolShell tool={reference}>
      <ShellReferenceWorkbench tool={reference} />
    </ToolShell>
  );

  it("server-renders the heading and descriptions from the registry", () => {
    expect(html).toMatch(new RegExp(`<h1>${escape(reference.title).replace(/[()]/g, "\\$&")}</h1>`));
    expect(html).toContain(escape(reference.shortDescription));
    expect(html).toContain(escape(reference.longDescription));
  });

  it("puts the AI disclosure and privacy statement next to the input", () => {
    const tryIt = html.indexOf(">Try it<");
    const disclosure = html.indexOf("How AI is used.");
    const privacy = html.indexOf(escape(reference.privacyStatement));
    const textarea = html.indexOf("<textarea");
    expect(tryIt).toBeGreaterThan(-1);
    expect(disclosure).toBeGreaterThan(tryIt);
    expect(privacy).toBeGreaterThan(disclosure);
    expect(textarea).toBeGreaterThan(privacy);
  });

  it("renders every limitation and the review date", () => {
    for (const limitation of reference.limitations) expect(html).toContain(escape(limitation));
    expect(html).toMatch(/datetime="2026-09-27"/i);
    expect(html).toContain("27 September 2026");
  });

  it("places related-app links after the workbench, never before it", () => {
    const continueAt = html.indexOf("Continue in TasksAI");
    expect(continueAt).toBeGreaterThan(html.indexOf("<textarea"));
  });

  it("renders the case-study link only when the registry has one", () => {
    expect(html).not.toContain("See how it was built");
    const withCaseStudy: ToolDefinition = { ...reference, caseStudyPath: "/projects/ai-workbench#reference" };
    expect(renderToStaticMarkup(<ToolShell tool={withCaseStudy}>x</ToolShell>)).toMatch(
      /href="[^"]+\/projects\/ai-workbench#reference">See how it was built/
    );
  });

  it("renders the workbench with a labelled input, secrets warning, counter, and example button", () => {
    expect(html).toMatch(/<label for="([^"]+)">Your notes<\/label><textarea id="\1"/);
    expect(html).toContain("Don&#x27;t paste passwords");
    expect(html).toContain("0 / 4,000 characters");
    expect(html).toContain(escape(reference.example.label));
    expect(html).toContain('role="status"');
  });
});

describe("ToolCard", () => {
  it("is driven by the registry entry", () => {
    const html = renderToStaticMarkup(<ToolCard tool={reference} />);
    expect(html).toContain('href="/tools/shell-reference"');
    expect(html).toContain("Experimental");
    expect(html).toContain(escape(reference.inputSummary));
  });
});

describe("ProvenanceBadge", () => {
  it("labels provenance with text, not colour alone", () => {
    expect(renderToStaticMarkup(<ProvenanceBadge provenance="extracted" />)).toContain("From your text");
    expect(renderToStaticMarkup(<ProvenanceBadge provenance="inferred" />)).toContain("Inferred");
    expect(renderToStaticMarkup(<ProvenanceBadge provenance="uncertain" />)).toContain("Needs your input");
  });
});
