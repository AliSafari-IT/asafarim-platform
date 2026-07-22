import { describe, it, expect } from "vitest";
import { ProviderError, isRetryableProviderError, safeProviderErrorMessage } from "./errors";

describe("isRetryableProviderError / ProviderError.retryable", () => {
  it.each([
    ["rate_limit", true],
    ["timeout", true],
    ["unavailable", true],
    ["authentication_error", false],
    ["invalid_request", false],
    ["malformed_response", false],
    ["cancelled", false],
    ["unknown", false],
  ] as const)("classifies %s as retryable=%s", (code, expected) => {
    expect(isRetryableProviderError(code)).toBe(expected);
    expect(new ProviderError({ code, message: "x" }).retryable).toBe(expected);
  });
});

describe("safeProviderErrorMessage", () => {
  it("never includes the word 'key', 'token', or 'password' for any code (no accidental secret leakage)", () => {
    for (const code of [
      "authentication_error",
      "rate_limit",
      "timeout",
      "unavailable",
      "malformed_response",
      "invalid_request",
      "cancelled",
      "unknown",
    ] as const) {
      const msg = safeProviderErrorMessage(code).toLowerCase();
      expect(msg).not.toMatch(/key|token|password|secret/);
    }
  });
});

describe("ProviderError", () => {
  it("does not serialize `cause` into its own message", () => {
    const err = new ProviderError({ code: "unknown", message: "safe message", cause: { apiKey: "sk-should-not-appear" } });
    expect(err.message).not.toContain("sk-should-not-appear");
  });
});
