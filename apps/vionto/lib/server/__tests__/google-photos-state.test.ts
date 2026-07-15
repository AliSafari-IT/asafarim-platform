import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { signState, verifyState } from "../google-photos/state";

describe("google-photos OAuth state", () => {
  const original = process.env.AUTH_SECRET;
  beforeEach(() => {
    process.env.AUTH_SECRET = "test-signing-secret";
  });
  afterEach(() => {
    process.env.AUTH_SECRET = original;
  });

  it("round-trips a signed state", () => {
    const token = signState({ userId: "u1", returnTo: "/create" });
    const state = verifyState(token);
    expect(state).not.toBeNull();
    expect(state!.userId).toBe("u1");
    expect(state!.returnTo).toBe("/create");
    expect(typeof state!.nonce).toBe("string");
  });

  it("rejects a tampered payload", () => {
    const token = signState({ userId: "u1", returnTo: "/create" });
    const [payload, sig] = token.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({ userId: "attacker", returnTo: "/create", nonce: "x", iat: Math.floor(Date.now() / 1000) }),
      "utf8",
    ).toString("base64url");
    expect(verifyState(`${tamperedPayload}.${sig}`)).toBeNull();
    expect(verifyState(`${payload}.deadbeef`)).toBeNull();
  });

  it("rejects malformed and empty tokens", () => {
    expect(verifyState(null)).toBeNull();
    expect(verifyState("")).toBeNull();
    expect(verifyState("noseparator")).toBeNull();
  });

  it("rejects an expired state", () => {
    const token = signState({ userId: "u1", returnTo: "/create" });
    // Re-sign with an old iat is internal; simulate by verifying after advancing time.
    const realNow = Date.now;
    try {
      Date.now = () => realNow() + 11 * 60 * 1000; // +11 minutes (TTL is 10)
      expect(verifyState(token)).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });

  it("fails to verify when the signing key differs", () => {
    const token = signState({ userId: "u1", returnTo: "/create" });
    process.env.AUTH_SECRET = "a-different-secret";
    expect(verifyState(token)).toBeNull();
  });
});
