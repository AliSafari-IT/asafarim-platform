import { describe, expect, it } from "vitest";
import { emptySpecification, validateSpecification, type AppMetadataType } from "@asafarim/appbuilder-schema";
import { getTemplate, listTemplates } from "./registry";
import { renderPreview } from "../render/renderPreview";
import { resolveHomePage } from "../render/resolvePage";

const app: AppMetadataType = { name: "Test App", slug: "test-app", description: "A test app." };

describe("template registry", () => {
  it("lists exactly the five approved starter families, matching apps/appbuilder's StarterFamily enum", () => {
    const ids = listTemplates()
      .map((template) => template.id)
      .sort();
    expect(ids).toEqual(["blank", "booking", "crm", "inventory", "task_management"].sort());
  });

  it("looks up a template by id and returns undefined for an unknown one", () => {
    expect(getTemplate("task_management")?.displayName).toBe("Task / project management");
    expect(getTemplate("does-not-exist")).toBeUndefined();
  });

  it("blank produces exactly emptySpecification(app) — zero behavior change for existing blank-family apps", () => {
    const template = getTemplate("blank")!;
    expect(template.build(app)).toEqual(emptySpecification(app));
  });

  for (const template of listTemplates()) {
    it(`"${template.id}" produces a valid specification (validateSpecification passes)`, () => {
      const spec = template.build(app);
      const result = validateSpecification(spec);
      expect(result.errors).toEqual([]);
      expect(result.ok).toBe(true);
    });

    it(`"${template.id}" is deterministic — the same app metadata always produces the same specification`, () => {
      expect(template.build(app)).toEqual(template.build(app));
    });

    if (template.id === "blank") {
      it('"blank" has no pages yet — the homepage renders a safe "no pages yet" empty state, not a failure', () => {
        const spec = template.build(app);
        expect(resolveHomePage(spec)).toBeUndefined();
        const result = renderPreview({ specification: spec, path: [], basePath: "/apps/app_1/preview" });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.warnings).toEqual([]);
      });

      it('"blank" still fails closed with unknown_page for any *other* requested path', () => {
        const spec = template.build(app);
        const result = renderPreview({ specification: spec, path: ["nonexistent"], basePath: "/apps/app_1/preview" });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors[0].code).toBe("unknown_page");
      });
    } else {
      it(`"${template.id}" resolves and renders a homepage with no render warnings`, () => {
        const spec = template.build(app);
        const homepage = resolveHomePage(spec);
        const result = renderPreview({ specification: spec, path: [], basePath: "/apps/app_1/preview" });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.pageId).toBe(homepage?.id);
        expect(result.warnings).toEqual([]);
      });
    }
  }

  it('"task_management" renders every declared page without render warnings', () => {
    const template = getTemplate("task_management")!;
    const spec = template.build(app);
    for (const page of spec.pages) {
      const result = renderPreview({
        specification: spec,
        path: page.path.length > 0 ? [page.path] : [],
        basePath: "/apps/app_1/preview",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.warnings).toEqual([]);
    }
  });
});
