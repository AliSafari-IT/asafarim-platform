import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { toolCatalogue } from "../../../content/tools";
import { testPlanExampleOutput } from "../../../content/tool-fixtures/requirements-to-test-plan";
import { getListedTools } from "../catalogue";
import { TestPlanEditor } from "./TestPlanEditor";
import { TestPlanWorkbench } from "./TestPlanWorkbench";

const html = renderToStaticMarkup(<TestPlanEditor plan={testPlanExampleOutput} origin="fixture" />);
const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("TestPlanEditor", () => {
  it("leads with the planning-only notice", () => {
    expect(html.indexOf("Planning help, not test results.")).toBeLessThan(html.indexOf("Scenarios ("));
  });

  it("lists open questions with their kind and linked sources", () => {
    expect(text).toContain("Open questions (4)");
    expect(html).toContain("Contradiction");
    expect(html).toMatch(/<a href="#[^"]+-src-R5">R5<\/a>/);
  });

  it("shows traceability: each requirement-based scenario quotes its source text", () => {
    expect(html).toMatch(/<blockquote><a href="#[^"]+-src-R4">R4<\/a> The reset link expires after 30 minutes\.<\/blockquote>/);
    expect(text).toContain("From your text");
  });

  it("labels inferred scenarios and shows their assumption", () => {
    expect(text).toContain("Inferred");
    expect(text).toContain("Assumption: The requirement doesn");
  });

  it("labels origin, and never claims execution", () => {
    expect(text).toContain("Sample (no AI)");
    // Domain words like "a failed page load" are fine; result claims are not.
    const withoutDisclaimer = text.replace("not test results", "");
    expect(withoutDisclaimer).not.toMatch(/\btests? (have )?(passed|failed)\b|\btest results\b|\bverified that\b|\b100 ?% coverage\b/i);
    expect(html).toContain("Planned only; nothing has been run.");
  });

  it("gives every scenario a labelled checkbox and named Edit/Remove buttons", () => {
    const checkboxes = html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];
    expect(checkboxes).toHaveLength(testPlanExampleOutput.scenarios.length);
    expect(checkboxes.every((c) => c.includes("checked"))).toBe(true);
    expect(html).toMatch(/<label for="[^"]+-include"[^>]*>Include TC-01 in export<\/label>/);
    expect(text).toContain("Edit TC-01");
    expect(text).toContain("Remove TC-01");
  });

  it("summarizes planned counts and offers export of the selection", () => {
    expect(text).toContain("Scenarios (10 of 10 selected)");
    expect(text).toMatch(/Permissions &amp; security 3|Permissions & security 3/);
    expect(text).toContain("Download Markdown");
    expect(text).toContain("Download JSON");
    expect(text).toContain("nothing is uploaded");
  });

  it("renders the numbered sources as anchor targets", () => {
    expect(html).toMatch(/<li id="[^"]+-src-R9" tabindex="-1">/);
  });
});

describe("TestPlanWorkbench", () => {
  const tool = toolCatalogue.find((t) => t.slug === "requirements-to-test-plan")!;
  const page = renderToStaticMarkup(<TestPlanWorkbench tool={tool} />);

  it("renders the labelled requirement input and optional details", () => {
    expect(page).toMatch(/<label for="([^"]+)">Requirement or user story<\/label><textarea id="\1"/);
    expect(page).toContain("Optional details");
    expect(page).toMatch(/<label for="[^"]+">Acceptance criteria<\/label>/);
    expect(page).toContain("Load the password-reset example");
    expect(page).toContain("0 / 8,000 characters");
  });
});

describe("listing", () => {
  it("keeps experimental tools off catalogue surfaces", () => {
    expect(getListedTools().some((t) => t.lifecycle === "experiment")).toBe(false);
  });
});
