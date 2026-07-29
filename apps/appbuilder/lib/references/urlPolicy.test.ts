import { describe, expect, it } from "vitest";
import {
  assertPublicHostname,
  classifyIpAddress,
  normalizeReferenceUrl,
} from "./urlPolicy";
import { ReferenceUrlNotAllowedError } from "./errors";

/**
 * M13 slice F — the SSRF boundary. Every case below is a real way people
 * reach internal services through a "fetch this URL for me" feature, so each
 * one is asserted rather than assumed: obfuscated IPv4 literals, IPv4-mapped
 * IPv6, container/service names, non-standard ports, credentials in the URL,
 * and DNS answers that mix a public address with a private one.
 */

function reason(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    if (err instanceof ReferenceUrlNotAllowedError) return err.reason;
    throw err;
  }
  throw new Error("expected the URL to be refused");
}

describe("classifyIpAddress", () => {
  it("classifies IPv4 ranges that must never be fetched", () => {
    expect(classifyIpAddress("127.0.0.1")).toBe("loopback");
    expect(classifyIpAddress("10.1.2.3")).toBe("private");
    expect(classifyIpAddress("172.16.0.1")).toBe("private");
    expect(classifyIpAddress("172.31.255.254")).toBe("private");
    expect(classifyIpAddress("192.168.1.1")).toBe("private");
    // The cloud metadata endpoint — the single highest-value SSRF target.
    expect(classifyIpAddress("169.254.169.254")).toBe("link_local");
    expect(classifyIpAddress("100.64.0.1")).toBe("cgnat");
    expect(classifyIpAddress("0.0.0.0")).toBe("unspecified");
    expect(classifyIpAddress("224.0.0.1")).toBe("multicast");
    expect(classifyIpAddress("255.255.255.255")).toBe("reserved");
  });

  it("keeps genuinely public IPv4 addresses public", () => {
    expect(classifyIpAddress("8.8.8.8")).toBe("public");
    expect(classifyIpAddress("140.82.121.4")).toBe("public");
    // 172.32/12 is outside the private block — an off-by-one here would
    // block real hosts.
    expect(classifyIpAddress("172.32.0.1")).toBe("public");
    expect(classifyIpAddress("11.0.0.1")).toBe("public");
  });

  it("classifies IPv6, including addresses that are IPv4 in disguise", () => {
    expect(classifyIpAddress("::1")).toBe("loopback");
    expect(classifyIpAddress("::")).toBe("unspecified");
    expect(classifyIpAddress("fc00::1")).toBe("unique_local");
    expect(classifyIpAddress("fd12:3456::1")).toBe("unique_local");
    expect(classifyIpAddress("fe80::1")).toBe("link_local");
    expect(classifyIpAddress("ff02::1")).toBe("multicast");
    expect(classifyIpAddress("2606:4700::1111")).toBe("public");
    // Same metadata endpoint reached three different ways.
    expect(classifyIpAddress("::ffff:169.254.169.254")).toBe("link_local");
    expect(classifyIpAddress("::ffff:a9fe:a9fe")).toBe("link_local");
    expect(classifyIpAddress("::ffff:127.0.0.1")).toBe("loopback");
    // 6to4/NAT64 embed an arbitrary IPv4 destination.
    expect(classifyIpAddress("2002:7f00:1::1")).toBe("reserved");
    expect(classifyIpAddress("64:ff9b::7f00:1")).toBe("reserved");
  });

  it("treats anything unparseable as invalid rather than guessing", () => {
    expect(classifyIpAddress("not-an-address")).toBe("invalid");
    expect(classifyIpAddress("999.1.1.1")).toBe("invalid");
    expect(classifyIpAddress("1:2:3:4:5:6:7:8:9")).toBe("invalid");
    expect(classifyIpAddress("fe80::1%eth0")).toBe("invalid");
  });
});

describe("normalizeReferenceUrl", () => {
  it("accepts a public https URL and normalizes it for the cache key", () => {
    expect(normalizeReferenceUrl("https://example.com/about").toString()).toBe("https://example.com/about");
    expect(normalizeReferenceUrl("  https://Example.COM/About  ").toString()).toBe("https://example.com/About");
    expect(normalizeReferenceUrl("https://example.com").toString()).toBe("https://example.com/");
  });

  it("refuses every scheme except https", () => {
    expect(reason(() => normalizeReferenceUrl("http://example.com"))).toBe("http");
    expect(reason(() => normalizeReferenceUrl("file:///etc/passwd"))).toBe("file");
    expect(reason(() => normalizeReferenceUrl("gopher://example.com"))).toBe("gopher");
    expect(reason(() => normalizeReferenceUrl("data:text/html,<h1>hi</h1>"))).toBe("data");
    expect(reason(() => normalizeReferenceUrl("example.com/about"))).toBe("malformed");
  });

  it("refuses embedded credentials and non-standard ports", () => {
    expect(reason(() => normalizeReferenceUrl("https://admin:secret@example.com/"))).toBe("embedded_credentials");
    expect(reason(() => normalizeReferenceUrl("https://example.com:8080/"))).toBe("non_standard_port");
    expect(reason(() => normalizeReferenceUrl("https://example.com:5432/"))).toBe("non_standard_port");
    // The scheme default is still fine, however written.
    expect(normalizeReferenceUrl("https://example.com:443/x").toString()).toBe("https://example.com/x");
  });

  it("refuses private and loopback IP literals, including obfuscated forms", () => {
    expect(reason(() => normalizeReferenceUrl("https://127.0.0.1/"))).toBe("loopback");
    expect(reason(() => normalizeReferenceUrl("https://169.254.169.254/latest/meta-data/"))).toBe("link_local");
    expect(reason(() => normalizeReferenceUrl("https://10.0.0.5/admin"))).toBe("private");
    expect(reason(() => normalizeReferenceUrl("https://[::1]/"))).toBe("loopback");
    expect(reason(() => normalizeReferenceUrl("https://[fd00::1]/"))).toBe("unique_local");
    // WHATWG URL parsing collapses these into dotted quads, which is exactly
    // why classification happens after normalization.
    expect(reason(() => normalizeReferenceUrl("https://2130706433/"))).toBe("loopback");
    expect(reason(() => normalizeReferenceUrl("https://0x7f000001/"))).toBe("loopback");
    expect(reason(() => normalizeReferenceUrl("https://[::ffff:169.254.169.254]/"))).toBe("link_local");
  });

  it("allows a public IP literal", () => {
    expect(normalizeReferenceUrl("https://8.8.8.8/").toString()).toBe("https://8.8.8.8/");
  });

  it("refuses internal hostname suffixes and single-label container names", () => {
    expect(reason(() => normalizeReferenceUrl("https://localhost/"))).toBe("internal_suffix");
    expect(reason(() => normalizeReferenceUrl("https://app.localhost/"))).toBe("internal_suffix");
    expect(reason(() => normalizeReferenceUrl("https://printer.local/"))).toBe("internal_suffix");
    expect(reason(() => normalizeReferenceUrl("https://metadata.google.internal/"))).toBe("internal_suffix");
    expect(reason(() => normalizeReferenceUrl("https://appbuilder-postgres/"))).toBe("not_a_public_name");
    expect(reason(() => normalizeReferenceUrl("https://redis/"))).toBe("not_a_public_name");
    expect(reason(() => normalizeReferenceUrl("https://host.example-corp/"))).toBe("not_a_public_name");
    // A trailing all-numeric label makes the URL parser attempt an IPv4 host
    // and reject the whole URL, so this one never reaches the TLD rule.
    expect(reason(() => normalizeReferenceUrl("https://example.123/"))).toBe("malformed");
  });

  it("refuses an over-long URL before any work happens", () => {
    expect(reason(() => normalizeReferenceUrl(`https://example.com/${"a".repeat(2_500)}`))).toBe("malformed");
  });
});

describe("assertPublicHostname", () => {
  it("accepts a name whose every answer is public", async () => {
    await expect(assertPublicHostname("example.com", async () => ["93.184.216.34", "2606:2800::1"])).resolves.toEqual([
      "93.184.216.34",
      "2606:2800::1",
    ]);
  });

  it("refuses a name that resolves to a private address", async () => {
    await expect(assertPublicHostname("internal.example.com", async () => ["10.0.0.7"])).rejects.toBeInstanceOf(
      ReferenceUrlNotAllowedError,
    );
  });

  it("refuses a DNS-rebinding answer that mixes one public and one private address", async () => {
    // The whole point of checking EVERY answer: a naive "first address" check
    // passes here, and the connection may still pick the loopback address.
    await expect(
      assertPublicHostname("rebind.example.com", async () => ["93.184.216.34", "127.0.0.1"]),
    ).rejects.toBeInstanceOf(ReferenceUrlNotAllowedError);
  });

  it("refuses an empty or failing resolution instead of letting the fetch try anyway", async () => {
    await expect(assertPublicHostname("nx.example.com", async () => [])).rejects.toMatchObject({ reason: "dns_empty" });
    await expect(
      assertPublicHostname("broken.example.com", async () => {
        throw new Error("ENOTFOUND");
      }),
    ).rejects.toMatchObject({ reason: "dns_failure" });
  });

  it("does not consult DNS for an IP literal — it classifies it directly", async () => {
    let resolverCalls = 0;
    const resolver = async () => {
      resolverCalls += 1;
      return ["93.184.216.34"];
    };
    await expect(assertPublicHostname("8.8.8.8", resolver)).resolves.toEqual(["8.8.8.8"]);
    await expect(assertPublicHostname("127.0.0.1", resolver)).rejects.toBeInstanceOf(ReferenceUrlNotAllowedError);
    expect(resolverCalls).toBe(0);
  });
});
