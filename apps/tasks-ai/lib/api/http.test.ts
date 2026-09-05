import { describe, expect, it } from "vitest";
import { assertVersion, hashRequest, parsePagination } from "./http";
import { ApiError } from "../errors";

function reqWith(headers: Record<string, string>): Request {
  return new Request("https://x.test/api/v1/resource", { headers });
}

describe("assertVersion", () => {
  it("passes when If-Match is absent (last-write-wins opt-out)", () => {
    expect(() => assertVersion(reqWith({}), 3)).not.toThrow();
  });

  it("passes when If-Match matches the current version", () => {
    expect(() => assertVersion(reqWith({ "if-match": '"3"' }), 3)).not.toThrow();
  });

  it("throws conflict_version on a stale If-Match", () => {
    try {
      assertVersion(reqWith({ "if-match": '"2"' }), 5);
      expect.unreachable();
    } catch (e) {
      expect((e as ApiError).code).toBe("conflict_version");
      expect((e as ApiError).details).toEqual({ expected: 2, current: 5 });
    }
  });

  it("throws validation_failed on a non-numeric If-Match", () => {
    expect(() => assertVersion(reqWith({ "if-match": '"abc"' }), 1)).toThrow(ApiError);
  });
});

describe("parsePagination", () => {
  it("defaults limit to 25 and cursor to undefined", () => {
    expect(parsePagination(new URL("https://x.test/l"))).toEqual({ limit: 25, cursor: undefined });
  });
  it("clamps an over-limit request via validation", () => {
    expect(() => parsePagination(new URL("https://x.test/l?limit=500"))).toThrow();
  });
  it("reads a cursor", () => {
    expect(parsePagination(new URL("https://x.test/l?cursor=abc&limit=10"))).toEqual({
      cursor: "abc",
      limit: 10,
    });
  });
});

describe("hashRequest", () => {
  it("is stable for the same method/path/body and differs otherwise", () => {
    const a = hashRequest("POST", "/x", { a: 1 });
    expect(hashRequest("POST", "/x", { a: 1 })).toBe(a);
    expect(hashRequest("POST", "/x", { a: 2 })).not.toBe(a);
  });
});
