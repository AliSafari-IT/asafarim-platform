import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { constructionTaskManagementFixture } from "@asafarim/appbuilder-schema/fixtures";
import type { ApplicationSpecificationType } from "@asafarim/appbuilder-schema";
import { renderPreview } from "./renderPreview";

const basePath = "/apps/app_1/preview";

describe("renderPreview — construction task-manager fixture", () => {
  it("renders the homepage with no warnings", () => {
    const result = renderPreview({ specification: constructionTaskManagementFixture, path: [], basePath });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pageId).toBe("dashboard");
    expect(result.warnings).toEqual([]);
    const html = renderToStaticMarkup(result.element);
    expect(html).toContain("Dashboard");
    expect(html).toContain("Projects");
    expect(html).toContain("Tasks");
    expect(html).toContain("Team");
  });

  it("renders the top-level dashboard.widgets (metric cards + chart) on the homepage", () => {
    const result = renderPreview({ specification: constructionTaskManagementFixture, path: [], basePath });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const html = renderToStaticMarkup(result.element);
    expect(html).toContain("ui-metric");
    expect(html).toContain("ab-chart");
  });

  it("does not render dashboard.widgets on a non-homepage", () => {
    const result = renderPreview({ specification: constructionTaskManagementFixture, path: ["projects"], basePath });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const html = renderToStaticMarkup(result.element);
    expect(html).not.toContain("ui-metric");
  });

  it("renders the projects page's table and form", () => {
    const result = renderPreview({ specification: constructionTaskManagementFixture, path: ["projects"], basePath });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const html = renderToStaticMarkup(result.element);
    expect(html).toContain("<table");
    expect(html).toContain("<form");
  });

  it("renders the tasks page's table and detail view", () => {
    const result = renderPreview({ specification: constructionTaskManagementFixture, path: ["tasks"], basePath });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const html = renderToStaticMarkup(result.element);
    expect(html).toContain("<table");
    expect(html).toContain("<dl");
  });

  it("renders the team page", () => {
    const result = renderPreview({ specification: constructionTaskManagementFixture, path: ["team"], basePath });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pageName).toBe("Team");
  });

  it("renders a safe 'no pages yet' empty state for a brand-new app with zero pages, instead of failing", () => {
    const spec: ApplicationSpecificationType = { ...constructionTaskManagementFixture, pages: [], navigation: [] };
    const result = renderPreview({ specification: spec, path: [], basePath });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual([]);
    const html = renderToStaticMarkup(result.element);
    expect(html).toContain("No pages configured yet");
  });

  it("still fails closed with unknown_page for a non-homepage path on a zero-page app", () => {
    const spec: ApplicationSpecificationType = { ...constructionTaskManagementFixture, pages: [], navigation: [] };
    const result = renderPreview({ specification: spec, path: ["projects"], basePath });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].code).toBe("unknown_page");
  });

  it("fails closed for an unknown page path", () => {
    const result = renderPreview({ specification: constructionTaskManagementFixture, path: ["does-not-exist"], basePath });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].code).toBe("unknown_page");
  });
});

describe("renderPreview — security and fail-closed behavior", () => {
  it("fails closed on an unregistered component kind/variant combination, without throwing", () => {
    const spec: ApplicationSpecificationType = {
      ...constructionTaskManagementFixture,
      pages: [
        {
          id: "broken",
          name: "Broken",
          path: "broken",
          archived: false,
          components: [{ id: "c1", kind: "dataTable", entityId: "project", config: { variant: "does-not-exist" }, order: 0 }],
        },
      ],
      navigation: [{ id: "nav_broken", label: "Broken", targetPageId: "broken", order: 0 }],
    };
    const result = renderPreview({ specification: spec, path: ["broken"], basePath });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe("unknown_variant");
    const html = renderToStaticMarkup(result.element);
    expect(html).toContain("Unsupported component");
  });

  it("fails closed on invalid component config instead of throwing", () => {
    const spec: ApplicationSpecificationType = {
      ...constructionTaskManagementFixture,
      pages: [
        {
          id: "broken",
          name: "Broken",
          path: "broken",
          archived: false,
          // Kanban requires groupByFieldId — omitted here.
          components: [{ id: "c1", kind: "dataTable", entityId: "project", config: { variant: "kanban" }, order: 0 }],
        },
      ],
      navigation: [{ id: "nav_broken", label: "Broken", targetPageId: "broken", order: 0 }],
    };
    const result = renderPreview({ specification: spec, path: ["broken"], basePath });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings[0].code).toBe("invalid_config");
  });

  it("reports an invalid binding (a config field id not on the bound entity) as a warning, not a crash", () => {
    // Unlike an unknown *entityId* (already rejected by validateSpecification's
    // own orphaned-reference check before the renderer ever runs), a config
    // key like Kanban's groupByFieldId points at a *field*, which the schema
    // package deliberately treats as an opaque config value it gives no
    // meaning to (see @asafarim/appbuilder-schema ui.ts) — so this class of
    // invalid binding is only ever caught here, by the registry entry itself.
    const spec: ApplicationSpecificationType = {
      ...constructionTaskManagementFixture,
      pages: [
        {
          id: "broken",
          name: "Broken",
          path: "broken",
          archived: false,
          components: [
            { id: "c1", kind: "dataTable", entityId: "project", config: { variant: "kanban", groupByFieldId: "does-not-exist" }, order: 0 },
          ],
        },
      ],
      navigation: [{ id: "nav_broken", label: "Broken", targetPageId: "broken", order: 0 }],
    };
    const result = renderPreview({ specification: spec, path: ["broken"], basePath });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.some((warning) => warning.code === "invalid_binding")).toBe(true);
  });

  it("never renders raw HTML/script text as markup — React text nodes are escaped", () => {
    const spec: ApplicationSpecificationType = {
      ...constructionTaskManagementFixture,
      branding: { ...constructionTaskManagementFixture.branding, companyName: "<img src=x onerror=alert(1)>" },
    };
    const result = renderPreview({ specification: spec, path: [], basePath });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const html = renderToStaticMarkup(result.element);
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).toContain("&lt;img");
  });

  it("rejects a malformed specification (workflow cycle) as a top-level failure, never a partial render", () => {
    const spec: ApplicationSpecificationType = {
      ...constructionTaskManagementFixture,
      workflows: [
        {
          id: "cyclic",
          name: "Cyclic",
          trigger: { kind: "onUpdate", entityId: "task" },
          archived: false,
          steps: [
            { id: "step_a", kind: "condition", config: { field: "status", equals: "done", onTrueStepId: "step_b", onFalseStepId: undefined } },
            { id: "step_b", kind: "condition", config: { field: "status", equals: "done", onTrueStepId: "step_a", onFalseStepId: undefined } },
          ],
        },
      ],
    };
    const result = renderPreview({ specification: spec, path: [], basePath });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].code).toBe("malformed_specification");
  });

  it("fails closed when a page exceeds the renderer's component-count ceiling", () => {
    const manyComponents = Array.from({ length: 101 }, (_, index) => ({
      id: `c${index}`,
      kind: "dataTable" as const,
      entityId: "project",
      config: {},
      order: index,
    }));
    const spec: ApplicationSpecificationType = {
      ...constructionTaskManagementFixture,
      pages: [{ id: "huge", name: "Huge", path: "huge", archived: false, components: manyComponents }],
      navigation: [{ id: "nav_huge", label: "Huge", targetPageId: "huge", order: 0 }],
    };
    const result = renderPreview({ specification: spec, path: ["huge"], basePath });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].code).toBe("render_count_exceeded");
  });
});
