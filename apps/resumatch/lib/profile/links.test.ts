import { describe, expect, it } from "vitest";
import { linkSchema, parseProfileContent } from "./contract";
import { displayUrl, headerLinks, linkText, normalizeLinkUrl, productLinks } from "./links";

describe("profile links contract", () => {
  it("accepts http(s) links and defaults an older profile to none", () => {
    expect(linkSchema.parse({ kind: "github", url: "https://github.com/me" })).toEqual({
      kind: "github",
      label: null,
      url: "https://github.com/me",
    });
    expect(parseProfileContent({}).links).toEqual([]);
  });

  it.each(["javascript:alert(1)", "data:text/html,hi", "ftp://example.test", "github.com/me", "https://"])(
    "rejects %s",
    (url) => {
      expect(linkSchema.safeParse({ kind: "other", url }).success).toBe(false);
    },
  );
});

describe("normalizeLinkUrl", () => {
  it("adds https:// to a bare address and leaves a scheme alone", () => {
    expect(normalizeLinkUrl(" github.com/me ")).toBe("https://github.com/me");
    expect(normalizeLinkUrl("http://example.test")).toBe("http://example.test");
    // Not rewritten into something that would pass validation.
    expect(normalizeLinkUrl("javascript:alert(1)")).toBe("javascript:alert(1)");
    expect(normalizeLinkUrl("")).toBe("");
  });
});

describe("display helpers", () => {
  const links = [
    { kind: "product" as const, label: "ResuMatch", url: "https://resumatch.example.test/" },
    { kind: "github" as const, label: null, url: "https://github.com/me" },
    { kind: "other" as const, label: "Blog", url: "https://blog.example.test" },
    { kind: "linkedin" as const, label: null, url: "https://www.linkedin.com/in/me/" },
  ];

  it("shows a short address, with the label when there is one", () => {
    expect(displayUrl("https://www.linkedin.com/in/me/")).toBe("linkedin.com/in/me");
    expect(linkText(links[2]!)).toBe("Blog: blog.example.test");
  });

  it("orders header links LinkedIn first and keeps products apart", () => {
    expect(headerLinks(links).map((link) => link.kind)).toEqual(["linkedin", "github", "other"]);
    expect(productLinks(links).map((link) => link.label)).toEqual(["ResuMatch"]);
  });
});
