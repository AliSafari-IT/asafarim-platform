import { describe, expect, it } from "vitest";
import { scrubDsn } from "./logger";

describe("scrubDsn", () => {
  it("removes a postgres connection string with credentials", () => {
    const line = "connecting to postgres://tasksai:s3cret@db.internal:5432/tasksai now";
    expect(scrubDsn(line)).toBe("connecting to [redacted-dsn] now");
  });

  it("removes a redis url with a password", () => {
    expect(scrubDsn("redis://default:hunter2@cache:6379")).toBe("[redacted-dsn]");
  });

  it("leaves credential-free urls alone", () => {
    const line = "GET https://tasks-ai.asafarim.com/api/health 200";
    expect(scrubDsn(line)).toBe(line);
  });
});
