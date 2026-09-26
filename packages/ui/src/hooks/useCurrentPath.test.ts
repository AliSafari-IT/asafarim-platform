import { describe, expect, it } from "vitest";
import { activeHref } from "./useCurrentPath";

const ORIGIN = "http://localhost:3012";
const NAV = [
  "/",
  "/roadmap",
  "/workspace",
  "/profile",
  "/tailor",
  "/tailor/history",
  "/applications",
  "/ai-usage",
];

describe("activeHref", () => {
  it("marks the matching section", () => {
    expect(activeHref(NAV, "/ai-usage", ORIGIN)).toBe("/ai-usage");
    expect(activeHref(NAV, "/profile", ORIGIN)).toBe("/profile");
  });

  it("prefers the longest match (history over tailor)", () => {
    expect(activeHref(NAV, "/tailor/history", ORIGIN)).toBe("/tailor/history");
    expect(activeHref(NAV, "/tailor/history/compare/a/b", ORIGIN)).toBe("/tailor/history");
  });

  it("marks a parent section for its sub-pages", () => {
    expect(activeHref(NAV, "/tailor/abc123/preview", ORIGIN)).toBe("/tailor");
  });

  it("matches the root only exactly", () => {
    expect(activeHref(NAV, "/", ORIGIN)).toBe("/");
    expect(activeHref(["/"], "/profile", ORIGIN)).toBeNull();
  });

  it("does not treat a shared prefix as a parent segment", () => {
    expect(activeHref(["/tailor"], "/tailored-things", ORIGIN)).toBeNull();
  });

  it("ignores trailing slashes", () => {
    expect(activeHref(NAV, "/profile/", ORIGIN)).toBe("/profile");
    expect(activeHref(["/profile/"], "/profile", ORIGIN)).toBe("/profile/");
  });

  it("never marks a link to another origin (cross-app links)", () => {
    expect(activeHref(["http://localhost:3001/profile"], "/profile", ORIGIN)).toBeNull();
    expect(activeHref(["http://localhost:3012/profile"], "/profile", ORIGIN)).toBe(
      "http://localhost:3012/profile",
    );
  });

  it("returns nothing before the path is known (server render)", () => {
    expect(activeHref(NAV, null, ORIGIN)).toBeNull();
    expect(activeHref(NAV, "/profile", undefined)).toBeNull();
  });
});
