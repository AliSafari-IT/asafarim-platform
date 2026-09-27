import { getServerTranslator } from "@asafarim/shared-i18n/server";
import { describe, expect, it } from "vitest";
import webDictionaries from "./i18n-dictionaries";
import { primaryNavItems } from "./nav";
import { getListedTools, hasListedTools } from "./tools/catalogue";

const en = getServerTranslator("en", webDictionaries);

describe("primaryNavItems", () => {
  it("adds the Tools entry before Contact when the catalogue has tools", () => {
    expect(primaryNavItems(en, { showTools: true }).map((i) => i.href)).toEqual([
      "/",
      "/about",
      "/services",
      "/projects",
      "/tools",
      "/contact",
    ]);
  });

  it("omits the Tools entry while the catalogue is empty", () => {
    expect(primaryNavItems(en, { showTools: false }).some((i) => i.href === "/tools")).toBe(false);
  });

  it("localizes the Tools label", () => {
    const fr = getServerTranslator("fr-BE", webDictionaries);
    expect(primaryNavItems(fr, { showTools: true }).find((i) => i.href === "/tools")?.label).toBe("Outils");
  });
});

describe("entry-point gating", () => {
  it("matches what the catalogue actually lists", () => {
    expect(hasListedTools()).toBe(getListedTools().length > 0);
  });
});
