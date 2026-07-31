import { describe, expect, it } from "vitest";
import { shouldGuardAnchorClick } from "./useLeaveGuard";

/**
 * The guard's decision table.
 *
 * Every `false` case here is a navigation the user explicitly asked for in a
 * way that does NOT lose the form — a new tab, a download, a same-page
 * anchor. Intercepting one of those would be a worse bug than missing a
 * guard, because the draft is persisted either way: a missed guard costs a
 * dialog, a wrong guard breaks the link.
 */

const BASE = {
  href: "/apps",
  target: null,
  hasDownloadAttr: false,
  currentUrl: "http://localhost:3006/apps/abc-123",
  defaultPrevented: false,
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
};

describe("shouldGuardAnchorClick", () => {
  it("guards a plain left click on a same-origin link to another page", () => {
    expect(shouldGuardAnchorClick(BASE)).toBe(true);
    expect(shouldGuardAnchorClick({ ...BASE, href: "http://localhost:3006/apps/new" })).toBe(true);
  });

  it("ignores modifier and non-left clicks — those open elsewhere and leave this page intact", () => {
    for (const modifier of ["metaKey", "ctrlKey", "shiftKey", "altKey"] as const) {
      expect(shouldGuardAnchorClick({ ...BASE, [modifier]: true })).toBe(false);
    }
    expect(shouldGuardAnchorClick({ ...BASE, button: 1 })).toBe(false);
    expect(shouldGuardAnchorClick({ ...BASE, button: 2 })).toBe(false);
  });

  it("ignores links that open in a new tab", () => {
    expect(shouldGuardAnchorClick({ ...BASE, target: "_blank" })).toBe(false);
    expect(shouldGuardAnchorClick({ ...BASE, target: "someframe" })).toBe(false);
    // An explicit _self is still this tab, so it is still guarded.
    expect(shouldGuardAnchorClick({ ...BASE, target: "_self" })).toBe(true);
  });

  it("ignores downloads — the page does not unload", () => {
    expect(shouldGuardAnchorClick({ ...BASE, hasDownloadAttr: true })).toBe(false);
  });

  it("ignores a same-page hash link", () => {
    // A bare "#section" only behaves this way because hrefs resolve against
    // the full current URL. Resolving against the origin instead made this
    // look like a navigation to "/", and every in-page anchor prompted.
    expect(shouldGuardAnchorClick({ ...BASE, href: "#section" })).toBe(false);
    expect(shouldGuardAnchorClick({ ...BASE, href: "/apps/abc-123#section" })).toBe(false);
    expect(shouldGuardAnchorClick({ ...BASE, href: "" })).toBe(false);
  });

  it("resolves a relative href against the current path, not the origin", () => {
    // From /apps/abc-123, "operations" is /apps/operations — a different
    // page, so it is guarded. Getting the base wrong here would silently
    // guard or skip the wrong links.
    expect(shouldGuardAnchorClick({ ...BASE, href: "operations" })).toBe(true);
    expect(shouldGuardAnchorClick({ ...BASE, href: "./abc-123" })).toBe(false);
  });

  it("ignores non-navigating schemes", () => {
    expect(shouldGuardAnchorClick({ ...BASE, href: "mailto:someone@example.com" })).toBe(false);
    expect(shouldGuardAnchorClick({ ...BASE, href: "tel:+3212345678" })).toBe(false);
  });

  it("leaves cross-origin links to the browser's own beforeunload prompt", () => {
    // We cannot route there, and beforeunload already covers it — trying to
    // handle it here would produce two prompts for one navigation.
    expect(shouldGuardAnchorClick({ ...BASE, href: "https://github.com/someone" })).toBe(false);
  });

  it("respects a click another handler already cancelled", () => {
    expect(shouldGuardAnchorClick({ ...BASE, defaultPrevented: true })).toBe(false);
  });

  it("ignores an anchor with no href", () => {
    expect(shouldGuardAnchorClick({ ...BASE, href: null })).toBe(false);
  });

  it("never throws on a malformed href, and guards it when it still resolves to another page", () => {
    // Junk resolves as a relative path, so the browser really would
    // navigate — guarding is correct. What matters is that it does not throw
    // out of a click handler.
    expect(() => shouldGuardAnchorClick({ ...BASE, href: "ht tp://%%%" })).not.toThrow();
    expect(shouldGuardAnchorClick({ ...BASE, href: "ht tp://%%%" })).toBe(true);
    expect(shouldGuardAnchorClick({ ...BASE, currentUrl: "not-a-url" })).toBe(false);
  });
});
