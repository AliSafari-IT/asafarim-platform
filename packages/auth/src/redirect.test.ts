import { describe, expect, it, vi } from "vitest";

vi.mock("@asafarim/db", () => ({ prisma: {} }));

import { resolveRedirect } from "./config";

const BASE = "https://hub.asafarim.com";
const TRUSTED = () => ["https://testora.asafarim.com", "https://asafarim.com"];

describe("resolveRedirect", () => {
  it("prefixes a relative URL with baseUrl", () => {
    expect(resolveRedirect("/dashboard?x=1", BASE, TRUSTED)).toBe(
      `${BASE}/dashboard?x=1`
    );
  });

  it("returns a same-origin URL unchanged", () => {
    const url = `${BASE}/account/security`;
    expect(resolveRedirect(url, BASE, TRUSTED)).toBe(url);
  });

  it("allows a trusted platform origin", () => {
    const url = "https://testora.asafarim.com/runs/42";
    expect(resolveRedirect(url, BASE, TRUSTED)).toBe(url);
  });

  it("sends an untrusted origin to baseUrl", () => {
    expect(resolveRedirect("https://evil.example/phish", BASE, TRUSTED)).toBe(
      BASE
    );
  });

  it("does not treat a look-alike host as trusted", () => {
    expect(
      resolveRedirect(
        "https://testora.asafarim.com.evil.example/",
        BASE,
        TRUSTED
      )
    ).toBe(BASE);
  });

  it("falls back to baseUrl when reading the trusted origins throws", () => {
    const broken = () => {
      throw new TypeError("Invalid URL");
    };
    expect(resolveRedirect("https://other.example/", BASE, broken)).toBe(BASE);
  });

  it("does not read the trusted origins for a relative or same-origin URL", () => {
    const spy = vi.fn(TRUSTED);
    resolveRedirect("/x", BASE, spy);
    resolveRedirect(`${BASE}/y`, BASE, spy);
    expect(spy).not.toHaveBeenCalled();
  });

  it.each(["http://", "https://exa mple.com", "not a url", ""])(
    "falls back to baseUrl without throwing for unparseable %j",
    (url) => {
      expect(() => resolveRedirect(url, BASE, TRUSTED)).not.toThrow();
      expect(resolveRedirect(url, BASE, TRUSTED)).toBe(BASE);
    }
  );
});
