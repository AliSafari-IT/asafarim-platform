import { DrizzleQueryError } from "drizzle-orm/errors";
import { describe, expect, it } from "vitest";
import { isUniqueViolation, pgErrorCode } from "./pgError";

function pgError(code: string): Error {
  return Object.assign(new Error("duplicate key value violates unique constraint"), { code });
}

describe("pgErrorCode", () => {
  it("reads the code of a bare node-postgres error", () => {
    expect(pgErrorCode(pgError("23505"))).toBe("23505");
  });

  it("reads the code through drizzle's DrizzleQueryError wrapper", () => {
    const wrapped = new DrizzleQueryError("insert into t values ($1)", ["x"], pgError("23505"));
    expect(pgErrorCode(wrapped)).toBe("23505");
    expect(isUniqueViolation(wrapped)).toBe(true);
  });

  it("returns undefined for errors without a SQLSTATE", () => {
    expect(pgErrorCode(new Error("boom"))).toBeUndefined();
    expect(pgErrorCode(null)).toBeUndefined();
    expect(pgErrorCode("23505")).toBeUndefined();
  });

  it("does not treat other SQLSTATEs as unique violations", () => {
    expect(isUniqueViolation(new DrizzleQueryError("q", [], pgError("23503")))).toBe(false);
  });

  it("stops on a self-referencing cause chain", () => {
    const loop: { cause?: unknown } = {};
    loop.cause = loop;
    expect(pgErrorCode(loop)).toBeUndefined();
  });
});
