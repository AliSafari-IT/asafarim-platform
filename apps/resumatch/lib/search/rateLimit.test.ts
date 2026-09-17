import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, resetRateLimitState } from "./rateLimit";

beforeEach(() => {
  resetRateLimitState();
});

describe("rate limiting", () => {
  it("allows requests under the limit", () => {
    const result = checkRateLimit("workspace-1", 0, 5);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("refuses once the limit is reached within the window", () => {
    for (let i = 0; i < 5; i += 1) checkRateLimit("workspace-1", i * 100, 5);
    const result = checkRateLimit("workspace-1", 500, 5);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets once the window has passed", () => {
    for (let i = 0; i < 5; i += 1) checkRateLimit("workspace-1", i, 5);
    const result = checkRateLimit("workspace-1", 61_000, 5);
    expect(result.allowed).toBe(true);
  });

  it("tracks each key independently, so one workspace cannot exhaust another's budget", () => {
    for (let i = 0; i < 5; i += 1) checkRateLimit("workspace-1", i, 5);
    expect(checkRateLimit("workspace-2", 0, 5).allowed).toBe(true);
  });
});
