import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RunArtifactBundle } from "@asafarim/testora-tasksai-contract";
import { TestEvidence } from "./TestEvidence";

function baseBundle(overrides: Partial<RunArtifactBundle> = {}): RunArtifactBundle {
  return {
    v: 1,
    bundleId: "11111111-1111-1111-1111-111111111111",
    runId: "run_1",
    scenarioId: "scn_login",
    scenarioTitle: "User can sign in",
    appId: "asafarim-web",
    status: "failed",
    attempt: 1,
    startedAt: "2026-09-10T10:00:00.000Z",
    finishedAt: "2026-09-10T10:00:12.000Z",
    browser: "chrome:headless",
    errorClass: "selector_not_found",
    errorMessage: "The element '#submit' was not found",
    steps: [
      { index: 0, label: "navigate to /login", status: "passed", startedAtMs: 0, durationMs: 800 },
      {
        index: 1,
        label: "click #submit",
        status: "failed",
        startedAtMs: 800,
        durationMs: 4000,
        selector: "#submit",
      },
    ],
    artifacts: [
      { kind: "screenshot", url: "https://testora.example.com/api/results/r1/artifact/screenshot" },
    ],
    ...overrides,
  };
}

describe("TestEvidence", () => {
  it("renders the screenshot, error, and step timeline with the failing step highlighted — no network calls", () => {
    const html = renderToStaticMarkup(<TestEvidence bundle={baseBundle()} />);
    expect(html).toContain("User can sign in");
    expect(html).toContain("The element &#x27;#submit&#x27; was not found");
    expect(html).toContain("selector not found");
    expect(html).toContain("https://testora.example.com/api/results/r1/artifact/screenshot");
    expect(html).toContain("click #submit");
    expect(html).toContain("ui-test-evidence__step--failed");
    // Purely a render of the bundle already in hand — nothing to fetch.
    expect(html).not.toMatch(/fetch\(|XMLHttpRequest/);
  });

  it("shows a fail-vs-pass note when context.previousPass is present", () => {
    const html = renderToStaticMarkup(
      <TestEvidence
        bundle={baseBundle({
          context: { previousPass: { resultId: "res_prev", createdAt: "2026-09-09T09:00:00.000Z" } },
        })}
      />,
    );
    expect(html).toContain("Last passing run");
  });

  it("omits the fail-vs-pass note and error block when neither applies", () => {
    const html = renderToStaticMarkup(
      <TestEvidence bundle={baseBundle({ status: "passed", errorClass: undefined, errorMessage: undefined })} />,
    );
    expect(html).not.toContain("Last passing run");
    expect(html).not.toContain("ui-test-evidence__error");
  });

  it("renders a deep link when provided, and a quarantined badge from context", () => {
    const html = renderToStaticMarkup(
      <TestEvidence
        bundle={baseBundle({ context: { quarantined: true } })}
        deepLinkUrl="https://testora.example.com/results/r1"
      />,
    );
    expect(html).toContain("View full result in Testora");
    expect(html).toContain("https://testora.example.com/results/r1");
    expect(html).toContain("Quarantined");
  });

  it("links out to the DOM snapshot when there is no screenshot", () => {
    const html = renderToStaticMarkup(
      <TestEvidence
        bundle={baseBundle({
          artifacts: [
            { kind: "dom_snapshot", url: "https://testora.example.com/api/results/r1/artifact/domSnapshot" },
          ],
        })}
      />,
    );
    expect(html).toContain("View DOM snapshot");
    expect(html).not.toContain("<img");
  });
});
