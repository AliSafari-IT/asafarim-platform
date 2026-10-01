import assert from "node:assert/strict";
import { test } from "node:test";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { isForeignKeyViolation, isUniqueViolation, pgErrorCode } from "./pg-error";

function pgError(code: string): Error {
  return Object.assign(new Error("constraint violation"), { code });
}

test("pgErrorCode reads the code of a bare node-postgres error", () => {
  assert.equal(pgErrorCode(pgError("23505")), "23505");
});

test("pgErrorCode reads the code through drizzle's DrizzleQueryError wrapper", () => {
  const unique = new DrizzleQueryError("insert into t values ($1)", ["x"], pgError("23505"));
  const fk = new DrizzleQueryError("delete from t where id = $1", ["x"], pgError("23503"));
  assert.equal(isUniqueViolation(unique), true);
  assert.equal(isForeignKeyViolation(unique), false);
  assert.equal(isForeignKeyViolation(fk), true);
  assert.equal(isUniqueViolation(fk), false);
});

test("pgErrorCode returns undefined for errors without a SQLSTATE", () => {
  assert.equal(pgErrorCode(new Error("boom")), undefined);
  assert.equal(pgErrorCode(null), undefined);
  assert.equal(pgErrorCode("23505"), undefined);
});

test("pgErrorCode stops on a self-referencing cause chain", () => {
  const loop: { cause?: unknown } = {};
  loop.cause = loop;
  assert.equal(pgErrorCode(loop), undefined);
});
