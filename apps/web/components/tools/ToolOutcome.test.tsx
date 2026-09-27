import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ToolRunState } from "../../lib/tools/run-state";
import { describeRunState } from "../../lib/tools/status-copy";
import { ToolOutcome } from "./ToolOutcome";

const render = (state: ToolRunState<string>) =>
  renderToStaticMarkup(
    <ToolOutcome<string>
      state={state}
      renderResult={(result, mode) => <p>RESULT:{result}:{mode}</p>}
      resultActions={() => <button>EXPORT</button>}
    />
  );

const nonResultStates: ToolRunState<string>[] = [
  { kind: "idle" },
  { kind: "sample" },
  { kind: "ready" },
  { kind: "running" },
  { kind: "invalid", issues: ["Add some text first."] },
  { kind: "rate-limited", retryAfterSeconds: 120 },
  { kind: "provider-disabled", reason: "unavailable" },
  { kind: "provider-disabled", reason: "paused" },
  { kind: "failed" },
];

describe("ToolOutcome", () => {
  it.each(nonResultStates.map((s) => [s.kind, s] as const))("renders no result or export in %s", (_, state) => {
    const html = render(state);
    expect(html).not.toContain("RESULT:");
    expect(html).not.toContain("EXPORT");
    expect(html).toContain(describeRunState(state).title.replace(/'/g, "&#x27;"));
  });

  it.each(nonResultStates.filter((s) => ["rate-limited", "provider-disabled", "failed"].includes(s.kind)))(
    "says plainly that no result was produced ($kind)",
    (state) => {
      const copy = describeRunState(state);
      expect(copy.body).toMatch(/No result was produced/);
      expect(`${copy.title} ${copy.body}`).not.toMatch(/generated from your text\.|Result ready/);
    }
  );

  it("labels a fixture success as a prepared example, not the user's result", () => {
    const html = render({ kind: "success", mode: "fixture", result: "r" });
    expect(html).toContain("RESULT:r:fixture");
    expect(html).toContain("EXPORT");
    expect(html).toContain("Example result");
    expect(html).toContain("No AI was used to produce it");
    expect(html).not.toContain("Result ready");
  });

  it("labels a live success as AI-drafted and needing review", () => {
    const html = render({ kind: "success", mode: "live", result: "r" });
    expect(html).toContain("Result ready");
    expect(html).toContain("Review and edit it");
  });

  it("renders a degraded result with what is missing and its mode", () => {
    const live = render({ kind: "degraded", mode: "live", result: "r", missing: ["risks"] });
    expect(live).toContain("RESULT:r:live");
    expect(live).toContain("Partial result");
    expect(live).toContain("risks");
    const fixture = render({ kind: "degraded", mode: "fixture", result: "r", missing: [] });
    expect(fixture).toContain("Partial example result");
    expect(fixture).toContain("not generated from your text");
  });

  it("shows a decorative, hidden spinner only while running", () => {
    expect(render({ kind: "running" })).toMatch(/aria-hidden="true"/);
    expect(render({ kind: "ready" })).not.toMatch(/aria-hidden="true"/);
  });

  it("makes the status panel programmatically focusable", () => {
    expect(render({ kind: "failed" })).toContain('tabindex="-1"');
  });

  it("mentions the wait time when rate-limited without encouraging retries", () => {
    expect(describeRunState({ kind: "rate-limited", retryAfterSeconds: 120 }).body).toMatch(/about 2 minutes/);
  });
});
