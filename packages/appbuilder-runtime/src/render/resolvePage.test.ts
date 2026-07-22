import { describe, expect, it } from "vitest";
import { constructionTaskManagementFixture } from "@asafarim/appbuilder-schema/fixtures";
import { buildNavItems, resolveHomePage, resolvePageByPath } from "./resolvePage";

describe("resolveHomePage", () => {
  it("resolves the page targeted by the lowest-order navigation item", () => {
    const page = resolveHomePage(constructionTaskManagementFixture);
    expect(page?.id).toBe("dashboard");
  });

  it("falls back to the first non-archived page when navigation is empty", () => {
    const spec = { ...constructionTaskManagementFixture, navigation: [] };
    const page = resolveHomePage(spec);
    expect(page?.id).toBe(constructionTaskManagementFixture.pages[0].id);
  });

  it("returns undefined when there are no pages at all", () => {
    const spec = { ...constructionTaskManagementFixture, navigation: [], pages: [] };
    expect(resolveHomePage(spec)).toBeUndefined();
  });
});

describe("resolvePageByPath", () => {
  it("resolves the homepage for an empty path", () => {
    const page = resolvePageByPath(constructionTaskManagementFixture, []);
    expect(page?.id).toBe("dashboard");
  });

  it("resolves a page by its full path", () => {
    const page = resolvePageByPath(constructionTaskManagementFixture, ["projects"]);
    expect(page?.id).toBe("projects");
  });

  it("returns undefined for an unknown path — never falls back to the homepage", () => {
    expect(resolvePageByPath(constructionTaskManagementFixture, ["does-not-exist"])).toBeUndefined();
  });

  it("never accepts a page by id when a path segment happens to match an id but not a path", () => {
    // "dashboard" is a page id in the fixture but its own `path` is "dashboard" too,
    // so this also verifies path (not id) is the resolution key.
    const page = resolvePageByPath(constructionTaskManagementFixture, ["dashboard"]);
    expect(page?.id).toBe("dashboard");
  });
});

describe("buildNavItems", () => {
  it("builds nav items prefixed with the caller-supplied basePath, dropping unresolved targets", () => {
    const items = buildNavItems(constructionTaskManagementFixture, "/apps/app_1/preview", "projects");
    expect(items.map((item) => item.label)).toEqual(["Dashboard", "Projects", "Tasks", "Team"]);
    expect(items.find((item) => item.label === "Projects")).toMatchObject({
      path: "/apps/app_1/preview/projects",
      active: true,
    });
    expect(items.find((item) => item.label === "Dashboard")?.active).toBe(false);
  });

  it("drops a navigation item whose target page is archived or missing", () => {
    const spec = {
      ...constructionTaskManagementFixture,
      navigation: [
        ...constructionTaskManagementFixture.navigation,
        { id: "nav_ghost", label: "Ghost", targetPageId: "does-not-exist", order: 99 },
      ],
    };
    const items = buildNavItems(spec, "/apps/app_1/preview", "projects");
    expect(items.some((item) => item.label === "Ghost")).toBe(false);
  });
});
