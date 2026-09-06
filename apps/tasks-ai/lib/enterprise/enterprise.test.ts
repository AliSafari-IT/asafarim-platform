import { describe, expect, it } from "vitest";
import { ipAllowed, verifyAuditStreamSig } from "./service";
import { createHmac } from "node:crypto";

describe("ipAllowed", () => {
  it("allows any IP when the allowlist is empty", () => {
    expect(ipAllowed([], "203.0.113.9")).toBe(true);
  });
  it("matches an exact address and a CIDR range", () => {
    expect(ipAllowed(["203.0.113.9"], "203.0.113.9")).toBe(true);
    expect(ipAllowed(["203.0.113.9"], "203.0.113.10")).toBe(false);
    expect(ipAllowed(["10.0.0.0/8"], "10.4.2.1")).toBe(true);
    expect(ipAllowed(["10.0.0.0/8"], "11.0.0.1")).toBe(false);
    expect(ipAllowed(["192.168.1.0/24"], "192.168.1.200")).toBe(true);
    expect(ipAllowed(["192.168.1.0/24"], "192.168.2.1")).toBe(false);
  });
  it("passes when any entry matches", () => {
    expect(ipAllowed(["10.0.0.0/8", "203.0.113.0/24"], "203.0.113.55")).toBe(true);
  });
});

describe("verifyAuditStreamSig", () => {
  const secret = "as_secret";
  const body = '{"events":[]}';
  it("accepts a fresh valid signature", () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
    expect(verifyAuditStreamSig(secret, body, ts, sig)).toBe(true);
  });
  it("rejects stale timestamps and tampered bodies", () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
    expect(verifyAuditStreamSig(secret, body, ts - 9999, sig)).toBe(false);
    expect(verifyAuditStreamSig(secret, body + "x", ts, sig)).toBe(false);
  });
});
