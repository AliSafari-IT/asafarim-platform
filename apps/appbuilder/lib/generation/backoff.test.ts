import { describe, it, expect } from "vitest";
import { computeBackoffDelayMs } from "./backoff";

describe("computeBackoffDelayMs", () => {
  it("never exceeds the exponential cap for a given attempt", () => {
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const cap = Math.min(60_000, 2_000 * 2 ** (attempt - 1));
      for (let i = 0; i < 20; i += 1) {
        const delay = computeBackoffDelayMs(attempt);
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThanOrEqual(cap);
      }
    }
  });

  it("respects a custom maxMs ceiling even at a high attempt count", () => {
    for (let i = 0; i < 20; i += 1) {
      const delay = computeBackoffDelayMs(20, { maxMs: 5_000 });
      expect(delay).toBeLessThanOrEqual(5_000);
    }
  });

  it("produces jitter — repeated calls at the same attempt are not all identical", () => {
    const delays = new Set(Array.from({ length: 10 }, () => computeBackoffDelayMs(5)));
    expect(delays.size).toBeGreaterThan(1);
  });

  it("clamps a non-positive attempt to the base delay's cap rather than throwing or going negative", () => {
    const delay = computeBackoffDelayMs(0);
    expect(delay).toBeGreaterThanOrEqual(0);
    expect(delay).toBeLessThanOrEqual(2_000);
  });
});
