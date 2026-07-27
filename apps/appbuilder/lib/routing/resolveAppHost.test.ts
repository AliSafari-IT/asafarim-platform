import { describe, expect, it } from "vitest";
import { normalizeHost, parseManagedAppHost, RESERVED_APP_SLUGS } from "./resolveAppHost";

describe("normalizeHost", () => {
  it("lowercases a well-formed host", () => {
    expect(normalizeHost("Demo-App.Apps.Asafarim.Com")).toEqual({ host: "demo-app.apps.asafarim.com" });
  });

  it("strips a trailing port", () => {
    expect(normalizeHost("demo-app.apps.asafarim.com:3000")).toEqual({ host: "demo-app.apps.asafarim.com" });
  });

  it("rejects null/empty input", () => {
    expect(normalizeHost(null)).toBeNull();
    expect(normalizeHost(undefined)).toBeNull();
    expect(normalizeHost("")).toBeNull();
  });

  it("rejects a host carrying a scheme or path", () => {
    expect(normalizeHost("https://demo-app.apps.asafarim.com")).toBeNull();
    expect(normalizeHost("demo-app.apps.asafarim.com/../admin")).toBeNull();
  });

  it("rejects an IPv4 literal", () => {
    expect(normalizeHost("127.0.0.1")).toBeNull();
    expect(normalizeHost("127.0.0.1:8080")).toBeNull();
  });

  it("rejects malformed/empty DNS labels", () => {
    expect(normalizeHost("..apps.asafarim.com")).toBeNull();
    expect(normalizeHost("-leading-hyphen.apps.asafarim.com")).toBeNull();
    expect(normalizeHost("trailing-hyphen-.apps.asafarim.com")).toBeNull();
    expect(normalizeHost("a".repeat(64) + ".apps.asafarim.com")).toBeNull();
  });

  it("rejects a single-label host", () => {
    expect(normalizeHost("localhost")).toBeNull();
  });

  it("rejects punycode / non-ASCII hosts (fail closed on unicode ambiguity)", () => {
    expect(normalizeHost("xn--80ak6aa92e.apps.asafarim.com")).toBeNull();
    expect(normalizeHost("dеmo-app.apps.asafarim.com")).toBeNull(); // Cyrillic 'е'
  });

  it("rejects an oversized host", () => {
    const huge = Array.from({ length: 10 }, () => "a".repeat(30)).join(".") + ".com";
    expect(normalizeHost(huge)).toBeNull();
  });
});

describe("parseManagedAppHost", () => {
  it("extracts the slug from a well-formed managed-app host", () => {
    expect(parseManagedAppHost("demo-app.apps.asafarim.com")).toEqual({ slug: "demo-app", host: "demo-app.apps.asafarim.com" });
  });

  it("is case-insensitive", () => {
    expect(parseManagedAppHost("Demo-App.Apps.Asafarim.Com")).toEqual({ slug: "demo-app", host: "demo-app.apps.asafarim.com" });
  });

  it("rejects a host on the wrong base domain", () => {
    expect(parseManagedAppHost("demo-app.asafarim.com")).toBeNull();
    expect(parseManagedAppHost("demo-app.evil.com")).toBeNull();
  });

  it("rejects nested nested subdomains under the managed-apps domain", () => {
    expect(parseManagedAppHost("foo.bar.apps.asafarim.com")).toBeNull();
  });

  it("rejects every reserved slug", () => {
    for (const slug of RESERVED_APP_SLUGS) {
      expect(parseManagedAppHost(`${slug}.apps.asafarim.com`)).toBeNull();
    }
  });

  it("rejects a malformed Host header outright", () => {
    expect(parseManagedAppHost("demo-app.apps.asafarim.com:9999/../etc")).toBeNull();
    expect(parseManagedAppHost(null)).toBeNull();
  });

  it("respects a custom base domain", () => {
    expect(parseManagedAppHost("demo-app.staging-apps.example.com", "staging-apps.example.com")).toEqual({
      slug: "demo-app",
      host: "demo-app.staging-apps.example.com",
    });
  });
});
