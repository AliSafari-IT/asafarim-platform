import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { TimelineRenderer } from "../TimelineRenderer";
import { TIMELINE_LAYOUTS, type TimelineInput } from "@/lib/schemas";
import { THEME_PRESETS } from "@/lib/timeline-config";

type Layout = TimelineInput["layout"];

const events = [
  {
    id: "clfoo0000000000000000000",
    title: "Kickoff",
    description: "The first thing that happened.",
    startAt: "2026-01-15T00:00:00.000Z",
    endAt: "2026-01-20T00:00:00.000Z",
    label: "meeting",
    sortOrder: 0,
  },
  {
    title: "Launch",
    description: "The second thing.",
    startAt: "2026-02-10T00:00:00.000Z",
    label: "launch",
    sortOrder: 1,
  },
] as TimelineInput["events"];

function render(layout: Layout, preset?: string) {
  return renderToStaticMarkup(
    <TimelineRenderer
      layout={layout}
      timeline={{
        title: "A timeline",
        subtitle: "A subtitle",
        theme: preset ? ({ preset } as never) : null,
        events,
      }}
    />
  );
}

describe("the themed viewer boundary", () => {
  it("renders exactly one .tl-root per timeline, for every layout", () => {
    for (const layout of TIMELINE_LAYOUTS) {
      const html = render(layout);
      const roots = html.match(/class="[^"]*\btl-root\b/g) ?? [];
      expect(roots, `layout ${layout} should have exactly one .tl-root`).toHaveLength(1);
    }
  });

  it("stamps the preset on the root for every layout and every theme", () => {
    for (const layout of TIMELINE_LAYOUTS) {
      for (const preset of THEME_PRESETS) {
        const html = render(layout, preset.id);
        expect(html, `${layout} + ${preset.id}`).toContain(`data-timeline-theme="${preset.id}"`);
      }
    }
  });

  it("falls back to canvas when the timeline has no stored preset", () => {
    expect(render("vertical")).toContain('data-timeline-theme="canvas"');
  });

  it("keeps data-layout on the root, which the export pipeline reads", () => {
    // lib/server/services/export.ts does
    //   document.querySelector(".tl-root")?.dataset.layout
    // to choose the capture viewport, so this attribute is load-bearing.
    for (const layout of TIMELINE_LAYOUTS) {
      expect(render(layout)).toContain(`data-layout="${layout}"`);
    }
  });

  it("renders calendar board and branching in all three themes", () => {
    for (const layout of ["calendar-board", "branch"] as const) {
      for (const preset of THEME_PRESETS) {
        const html = render(layout, preset.id);
        expect(html).toContain(`data-timeline-theme="${preset.id}"`);
        // Content still present — theming must not blank the layout out.
        expect(html).toContain("Kickoff");
        expect(html).toContain("Launch");
      }
    }
  });

  it("no longer hardcodes a dark palette in calendar board or branching", () => {
    // These two used to pin their own near-black background and white text,
    // which silently overrode whichever theme the author picked.
    for (const layout of ["calendar-board", "branch"] as const) {
      const html = render(layout, "editorial");
      expect(html, layout).not.toMatch(/#0a0a1a|#050510|#131034|#f1eefc/i);
      expect(html, layout).not.toMatch(/rgba\(255,\s*255,\s*255/);
    }
  });

  it("never emits an app-level --color-* definition from a renderer", () => {
    // Renderers may *read* tokens, but defining --color-* inline would put an
    // app-theme variable inside the timeline subtree.
    for (const layout of TIMELINE_LAYOUTS) {
      const html = render(layout, "midnight");
      expect(html, layout).not.toMatch(/--color-[a-z-]+\s*:/);
    }
  });

  it("emits per-timeline overrides on the root, above the preset", () => {
    const html = renderToStaticMarkup(
      <TimelineRenderer
        layout="vertical"
        timeline={{
          title: "Custom",
          theme: { preset: "midnight", accentColor: "#ff8800", connectorColor: "#00ffcc" } as never,
          events,
        }}
      />
    );
    expect(html).toContain('data-timeline-theme="midnight"');
    expect(html).toContain("--tl-accent:#ff8800");
    expect(html).toContain("--tl-connector:#00ffcc");
  });
});

describe("timeline themes stay out of the application theme", () => {
  // Comments are stripped first: they sit between rules, so a naive
  // selector capture would otherwise swallow the preceding comment text —
  // and the comment above these rules discusses :root and data-theme
  // precisely to explain why the rules avoid them.
  const css = readFileSync(path.join(__dirname, "../../../../app/globals.css"), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    ""
  );

  // Only the rules that define timeline tokens — the app's own :root blocks
  // above them are not part of this contract.
  const tlRules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, , body]) => /--tl-[a-z-]+\s*:/.test(body));

  it("defines every --tl-* token under .tl-root and nowhere else", () => {
    expect(tlRules.length).toBeGreaterThan(0);
    for (const [, selector] of tlRules) {
      expect(selector.trim(), `--tl-* defined by selector: ${selector.trim()}`).toMatch(/\.tl-root/);
    }
  });

  it("never targets :root, html, or body from a timeline theme rule", () => {
    for (const [, selector] of tlRules) {
      expect(selector).not.toMatch(/(^|[\s,])(:root|html|body)\b/);
    }
  });

  it("does not make a timeline theme depend on the page theme", () => {
    // A [data-theme=...] in a timeline-token selector would mean the app's
    // light/dark setting changed how a timeline looks.
    for (const [, selector] of tlRules) {
      expect(selector).not.toMatch(/data-theme/);
    }
  });

  it("defines no app-level --color-* token inside a .tl-root rule", () => {
    for (const [selector, , body] of tlRules.map(([full, sel, b]) => [sel, full, b] as const)) {
      if (/\.tl-root/.test(selector)) {
        expect(body).not.toMatch(/--color-[a-z-]+\s*:/);
      }
    }
  });
});
