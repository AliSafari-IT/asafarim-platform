import { describe, expect, it, vi } from "vitest";
import { isPublicAddress, publicHttpsPolicy, renderJobPosting } from "./renderJob";

/** Browser-free checks of the render tier's URL policy (#518). */

type Resolver = Parameters<typeof publicHttpsPolicy>[0];
const resolver = (map: Record<string, string[]>) =>
  vi.fn(async (host: string) => {
    const addresses = map[host];
    if (!addresses) throw new Error("ENOTFOUND");
    return addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  }) as unknown as Resolver;

describe("isPublicAddress", () => {
  it("refuses private, loopback, link-local, CGNAT, multicast and mapped addresses", () => {
    for (const address of ["10.1.2.3", "127.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "::ffff:127.0.0.1"]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });

  it("accepts public addresses", () => {
    for (const address of ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946", "::ffff:93.184.216.34"]) {
      expect(isPublicAddress(address), address).toBe(true);
    }
  });
});

describe("publicHttpsPolicy", () => {
  it("refuses a public-looking name that resolves to a private address", async () => {
    const policy = publicHttpsPolicy(resolver({ "jobs.example.com": ["10.0.0.5"], "ok.example.com": ["93.184.216.34"] }));
    expect(await policy("https://jobs.example.com/x")).toBe(false);
    expect(await policy("https://ok.example.com/x")).toBe(true);
  });

  it("refuses a name when any one of its addresses is private", async () => {
    const policy = publicHttpsPolicy(resolver({ "mixed.example.com": ["93.184.216.34", "127.0.0.1"] }));
    expect(await policy("https://mixed.example.com/")).toBe(false);
  });

  it("keeps the plain GET's rules: HTTPS only, no internal names, unresolvable is refused", async () => {
    const lookup = resolver({ "ok.example.com": ["93.184.216.34"] });
    const policy = publicHttpsPolicy(lookup);
    expect(await policy("http://ok.example.com/")).toBe(false);
    expect(await policy("https://metadata.google.internal/")).toBe(false);
    expect(await policy("https://169.254.169.254/")).toBe(false);
    expect(await policy("https://missing.example.com/")).toBe(false);
    expect(await policy("wss://ok.example.com/")).toBe(false);
  });

  it("resolves each host once per render", async () => {
    const lookup = resolver({ "ok.example.com": ["93.184.216.34"] });
    const policy = publicHttpsPolicy(lookup);
    await policy("https://ok.example.com/a");
    await policy("https://ok.example.com/b");
    expect(lookup).toHaveBeenCalledTimes(1);
  });
});

describe("renderJobPosting without a browser", () => {
  it("reports UNAVAILABLE when no Chromium is configured", async () => {
    expect(await renderJobPosting("https://jobs.example.com/1", { executablePath: null })).toEqual({ ok: false, failure: "UNAVAILABLE" });
  });

  it("checks the URL before launching anything", async () => {
    const policy = vi.fn(async () => false);
    expect(await renderJobPosting("https://jobs.example.com/1", { executablePath: "/nonexistent/chrome", policy })).toEqual({
      ok: false,
      failure: "URL_NOT_ALLOWED",
    });
  });

  it("reports LAUNCH_FAILED for a broken Chromium path, without throwing", async () => {
    const result = await renderJobPosting("https://jobs.example.com/1", { executablePath: "/nonexistent/chrome", policy: async () => true });
    expect(result).toEqual({ ok: false, failure: "LAUNCH_FAILED" });
  });
});
