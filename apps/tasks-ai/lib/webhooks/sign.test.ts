import { describe, expect, it } from "vitest";
import { signBody, verifySignature } from "./service";

describe("webhook signing", () => {
  const secret = "whsec_abc123";
  const body = JSON.stringify({ event: "task.created", data: { id: "t1" } });

  it("verifies a well-formed signature within the replay window", () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = signBody(secret, body, ts);
    expect(verifySignature(secret, body, ts, sig)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = signBody(secret, body, ts);
    expect(verifySignature(secret, body + " ", ts, sig)).toBe(false);
  });

  it("rejects a stale timestamp (replay protection)", () => {
    const old = Math.floor(Date.now() / 1000) - 10_000;
    const sig = signBody(secret, body, old);
    expect(verifySignature(secret, body, old, sig)).toBe(false);
  });

  it("rejects a signature made with the wrong secret", () => {
    const ts = Math.floor(Date.now() / 1000);
    expect(verifySignature(secret, body, ts, signBody("other", body, ts))).toBe(false);
  });
});
