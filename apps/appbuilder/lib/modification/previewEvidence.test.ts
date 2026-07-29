import { describe, expect, it } from "vitest";
import { emptySpecification } from "@asafarim/appbuilder-schema";
import { buildSpecIndex } from "./specIndex";
import { PreviewEvidence, mapPreviewEvidence, toContextPreviewEvidence } from "./previewEvidence";

const index = buildSpecIndex(
  {
    ...emptySpecification({ name: "Eval App", slug: "eval-app" }),
    pages: [
      {
        id: "home",
        name: "Home",
        path: "home",
        archived: false,
        components: [{ id: "tasks_table", kind: "dataTable", order: 0, config: { title: "Open tasks" } }],
      },
    ],
    navigation: [{ id: "nav_home", label: "Home", targetPageId: "home", order: 0 }],
  },
  3,
);

describe("mapPreviewEvidence", () => {
  it("maps a selected component to its editable properties", () => {
    const mapping = mapPreviewEvidence({ pageId: "home", componentId: "tasks_table" }, index);
    expect(mapping).toMatchObject({ kind: "spec_target", matchedBy: "component_id" });
    const ids = mapping?.kind === "spec_target" ? mapping.targets.map((t) => t.targetId) : [];
    expect(ids).toContain("pages.home.components.tasks_table.config.title");
    expect(ids.every((id) => id.includes("tasks_table"))).toBe(true);
  });

  it("maps a selected page to its own properties", () => {
    const mapping = mapPreviewEvidence({ pageId: "home" }, index);
    expect(mapping).toMatchObject({ kind: "spec_target", matchedBy: "page_id" });
    const ids = mapping?.kind === "spec_target" ? mapping.targets.map((t) => t.targetId) : [];
    expect(ids.sort()).toEqual([
      "pages.home.components.tasks_table.config.title",
      "pages.home.components.tasks_table.kind",
      "pages.home.name",
      "pages.home.path",
    ]);
  });

  it("refuses to invent a target for a component id that is no longer in the specification", () => {
    const mapping = mapPreviewEvidence({ componentId: "deleted_widget" }, index);
    expect(mapping?.kind).toBe("unmapped");
    // Critically: NOT a spec_target with an empty/synthesised target. A
    // selector that names something gone maps to nothing at all.
    expect(mapping).not.toHaveProperty("targets");
  });

  it("falls back to matching the element's own text against indexed values", () => {
    const mapping = mapPreviewEvidence({ domTagName: "h1", domTextSnippet: "Open tasks" }, index);
    expect(mapping).toMatchObject({ kind: "spec_target", matchedBy: "dom_text" });
    const ids = mapping?.kind === "spec_target" ? mapping.targets.map((t) => t.targetId) : [];
    expect(ids).toEqual(["pages.home.components.tasks_table.config.title"]);
  });

  it("classifies a click outside any rendered page region as builder chrome, not a missing target", () => {
    const mapping = mapPreviewEvidence(
      { domTagName: "header", domTextSnippet: "AppBuilder workspace", domOutsideSpecRegion: true },
      index,
    );
    expect(mapping?.kind).toBe("builder_chrome");
    expect(mapping?.kind === "builder_chrome" ? mapping.reason : "").toMatch(/builder chrome/i);
  });

  it("says it could not match rather than guessing, for text that matches nothing", () => {
    const mapping = mapPreviewEvidence({ domTagName: "span", domTextSnippet: "Loading…" }, index);
    expect(mapping?.kind).toBe("unmapped");
  });

  it("returns null when there was no selection at all", () => {
    expect(mapPreviewEvidence(null, index)).toBeNull();
  });
});

describe("PreviewEvidence schema", () => {
  it("bounds every DOM field it accepts", () => {
    expect(PreviewEvidence.safeParse({ domTextSnippet: "x".repeat(201) }).success).toBe(false);
    expect(PreviewEvidence.safeParse({ domTagName: "x".repeat(41) }).success).toBe(false);
    expect(PreviewEvidence.safeParse({ domRole: "x".repeat(41) }).success).toBe(false);
    expect(PreviewEvidence.safeParse({ domTagName: "h1", domOutsideSpecRegion: true }).success).toBe(true);
  });
});

describe("toContextPreviewEvidence", () => {
  it("forwards stable target ids and never the originating DOM evidence", () => {
    const mapping = mapPreviewEvidence({ domTagName: "h1", domTextSnippet: "Open tasks" }, index);
    const projected = toContextPreviewEvidence(mapping);

    expect(projected).toEqual({
      kind: "spec_target",
      targetIds: ["pages.home.components.tasks_table.config.title"],
    });
    expect(JSON.stringify(projected)).not.toContain("h1");
  });

  it("forwards the safe reason for a chrome/unmapped click", () => {
    const projected = toContextPreviewEvidence(mapPreviewEvidence({ domOutsideSpecRegion: true }, index));
    expect(projected?.kind).toBe("builder_chrome");
    expect(projected?.targetIds).toBeUndefined();
  });
});
