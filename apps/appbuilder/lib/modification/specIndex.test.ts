import { describe, expect, it } from "vitest";
import { emptySpecification, type ApplicationSpecificationType } from "@asafarim/appbuilder-schema";
import { buildSpecIndex, matchesPropertyAlias, normalizeText } from "./specIndex";

function titleApp(overrides: Partial<ApplicationSpecificationType> = {}): ApplicationSpecificationType {
  return {
    ...emptySpecification({ name: "Eval App", slug: "eval-app" }),
    branding: { theme: "system", primaryColor: "#111111" },
    pages: [{ id: "home", name: "Home", path: "home", components: [], archived: false }],
    navigation: [{ id: "nav_home", label: "Home", targetPageId: "home", order: 0 }],
    ...overrides,
  };
}

describe("buildSpecIndex", () => {
  it("indexes a page's title by its stable id and its current value", () => {
    const index = buildSpecIndex(titleApp(), 4);

    const title = index.byTargetId.get("pages.home.name");
    expect(title).toBeDefined();
    expect(title?.value).toBe("Home");
    expect(title?.pageId).toBe("home");
    expect(title?.visibleText).toBe(true);

    expect(index.byStableId.get("home")?.map((t) => t.targetId)).toContain("pages.home.name");
    expect(index.byNormalizedValue.get("home")?.map((t) => t.targetId)).toContain("pages.home.name");
    expect(index.specificationVersionNumber).toBe(4);
  });

  it("buckets every target literally valued 'Home' together — page title, menu label, and the path that happens to match", () => {
    const index = buildSpecIndex(titleApp(), 1);
    const matches = index.byNormalizedValue.get("home") ?? [];
    // Three genuinely distinct properties hold that string. Resolution
    // between them is the resolver's job (property words break the tie);
    // the index's job is to report all of them rather than pick.
    expect(matches.map((t) => t.targetId).sort()).toEqual([
      "navigation.nav_home.label",
      "pages.home.name",
      "pages.home.path",
    ]);
  });

  it("treats 'title' as a page-title word but NOT as a navigation-link word", () => {
    const index = buildSpecIndex(titleApp(), 1);
    const page = index.byTargetId.get("pages.home.name")!;
    const nav = index.byTargetId.get("navigation.nav_home.label")!;

    expect(matchesPropertyAlias(page, "title")).toBe(true);
    // A menu entry is a link, not a title — this is what keeps "the title
    // whose value is Home" from tying against the Home menu item.
    expect(matchesPropertyAlias(nav, "title")).toBe(false);
    expect(matchesPropertyAlias(nav, "menu item")).toBe(true);
  });

  it("indexes branding.primaryColor as the only colour-valued property", () => {
    const index = buildSpecIndex(titleApp(), 1);
    const colorTargets = index.targets.filter((t) => t.aliases.some((a) => normalizeText(a) === "color"));
    expect(colorTargets.map((t) => t.targetId)).toEqual(["branding.primaryColor"]);
    expect(index.byTargetId.get("branding.primaryColor")?.value).toBe("#111111");
  });

  it("indexes a component's visible-text config keys, and nothing else from its free-form config", () => {
    const index = buildSpecIndex(
      titleApp({
        pages: [
          {
            id: "home",
            name: "Home",
            path: "home",
            archived: false,
            components: [
              {
                id: "hero",
                kind: "detailView",
                order: 0,
                config: { title: "Welcome", density: "compact", onClick: "doSomething" },
              },
            ],
          },
        ],
      }),
      1,
    );

    expect(index.byTargetId.get("pages.home.components.hero.config.title")?.value).toBe("Welcome");
    expect(index.byTargetId.has("pages.home.components.hero.config.density")).toBe(false);
    expect(index.byTargetId.has("pages.home.components.hero.config.onClick")).toBe(false);
  });

  it("keeps archived pages in the index but flags them, so they stay explainable rather than vanishing", () => {
    const index = buildSpecIndex(
      titleApp({ pages: [{ id: "home", name: "Home", path: "home", components: [], archived: true }] }),
      1,
    );
    expect(index.byTargetId.get("pages.home.name")?.archived).toBe(true);
  });

  it("normalizes case and whitespace consistently for every comparison", () => {
    expect(normalizeText("  Home   Page ")).toBe("home page");
    const index = buildSpecIndex(
      titleApp({ pages: [{ id: "home", name: "  Home  Page ", path: "home", components: [], archived: false }] }),
      1,
    );
    expect(index.byNormalizedValue.has("home page")).toBe(true);
  });
});
