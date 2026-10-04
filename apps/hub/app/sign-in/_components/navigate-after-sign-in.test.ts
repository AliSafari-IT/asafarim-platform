import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { navigateAfterSignIn } from "./navigate-after-sign-in";

const assign = vi.fn();
let href = "";
const router = { push: vi.fn(), refresh: vi.fn() };

beforeEach(() => {
  href = "";
  vi.stubGlobal("window", {
    location: {
      assign,
      get href() {
        return href;
      },
      set href(value: string) {
        href = value;
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("navigateAfterSignIn", () => {
  it.each(["/oidc/continue", "/oidc/continue?ticket=x"])(
    "%s is a full page navigation, with no router calls",
    (url) => {
      navigateAfterSignIn(url, router);
      expect(assign).toHaveBeenCalledTimes(1);
      expect(assign).toHaveBeenCalledWith(url);
      expect(router.push).not.toHaveBeenCalled();
      expect(router.refresh).not.toHaveBeenCalled();
      expect(href).toBe("");
    }
  );

  it("an ordinary Hub path uses the router, and no location call", () => {
    navigateAfterSignIn("/dashboard", router);
    expect(router.push).toHaveBeenCalledWith("/dashboard");
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
    expect(href).toBe("");
  });

  it("an absolute trusted URL sets location.href, with no router calls", () => {
    navigateAfterSignIn("https://web.asafarim.com/x", router);
    expect(href).toBe("https://web.asafarim.com/x");
    expect(assign).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("only the /oidc/ prefix is special: /oidcish and /x/oidc/ use the router", () => {
    navigateAfterSignIn("/oidcish", router);
    navigateAfterSignIn("/x/oidc/continue", router);
    expect(router.push).toHaveBeenCalledTimes(2);
    expect(assign).not.toHaveBeenCalled();
  });
});
