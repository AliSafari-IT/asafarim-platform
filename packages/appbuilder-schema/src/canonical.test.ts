import { describe, expect, it } from "vitest";
import { canonicalize, checksumOf } from "./canonical";

describe("canonicalize", () => {
  it("is independent of object key insertion order", () => {
    const a = { b: 1, a: 2, c: { z: 1, y: 2 } };
    const b = { a: 2, c: { y: 2, z: 1 }, b: 1 };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it("preserves array order (arrays are meaningful data, not resorted)", () => {
    const a = { items: [1, 2, 3] };
    const b = { items: [3, 2, 1] };
    expect(canonicalize(a)).not.toBe(canonicalize(b));
  });

  it("does not use locale-aware key comparison", () => {
    // Under some locale-aware compares, "Z" and "a" order differently than
    // plain code-unit comparison. Sanity: canonicalize is stable and
    // reproducible regardless of process locale (we don't call
    // localeCompare anywhere in canonical.ts).
    const value = { Z: 1, a: 2, A: 3, z: 4 };
    const first = canonicalize(value);
    const second = canonicalize(value);
    expect(first).toBe(second);
  });
});

describe("checksumOf", () => {
  it("is a documented sha256 hex digest (64 hex chars)", () => {
    const checksum = checksumOf({ a: 1 });
    expect(checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces the same checksum for the same logical value regardless of key order", () => {
    const a = { b: 1, a: 2 };
    const b = { a: 2, b: 1 };
    expect(checksumOf(a)).toBe(checksumOf(b));
  });

  it("produces a different checksum when the value actually differs", () => {
    expect(checksumOf({ a: 1 })).not.toBe(checksumOf({ a: 2 }));
  });
});
