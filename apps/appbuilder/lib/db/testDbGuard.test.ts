import { describe, expect, it } from "vitest";
import { assertSafeTestDatabaseUrl, resolveDevDatabaseUrl } from "./testDbGuard";

const DEV_URL = "postgres://appbuilder:appbuilder_dev@localhost:55436/appbuilder";

describe("resolveDevDatabaseUrl", () => {
  it("falls back to the local dev default when unset", () => {
    expect(resolveDevDatabaseUrl({})).toBe(DEV_URL);
  });

  it("honors APPBUILDER_DATABASE_URL", () => {
    const prod = "postgres://appbuilder:secret@db.internal:5432/appbuilder";
    expect(resolveDevDatabaseUrl({ APPBUILDER_DATABASE_URL: prod })).toBe(prod);
  });
});

/**
 * THE guard preventing the integration suite's `resetTestDb()` — TRUNCATE
 * CASCADE on every app-owned table, before every test — from ever running
 * against the same database a developer's `pnpm dev` uses. This is what a
 * real incident looked like without it: no APPBUILDER_TEST_DATABASE_URL set,
 * so the suite silently wiped a developer's dev database on its first test.
 */
describe("assertSafeTestDatabaseUrl", () => {
  it("refuses when APPBUILDER_TEST_DATABASE_URL is not set at all", () => {
    expect(() => assertSafeTestDatabaseUrl({})).toThrow(
      /APPBUILDER_TEST_DATABASE_URL is not set/,
    );
  });

  it("refuses when the test URL is byte-identical to the dev URL", () => {
    expect(() =>
      assertSafeTestDatabaseUrl({ APPBUILDER_TEST_DATABASE_URL: DEV_URL }),
    ).toThrow(/identical to the dev\/prod database/);
  });

  it("refuses when the test database name matches the dev one, even on a different host", () => {
    expect(() =>
      assertSafeTestDatabaseUrl({
        APPBUILDER_TEST_DATABASE_URL: "postgres://x:y@other-host:5432/appbuilder",
      }),
    ).toThrow(/matches the dev\/prod database name/);
  });

  it("refuses a test database whose name doesn't look like a scratch database, even if otherwise distinct", () => {
    expect(() =>
      assertSafeTestDatabaseUrl({
        APPBUILDER_TEST_DATABASE_URL: "postgres://x:y@localhost:55436/appbuilder_staging",
      }),
    ).toThrow(/doesn't look like a scratch database/);
  });

  it("allows a test database that is distinct, differently named, and clearly a scratch database", () => {
    const testUrl = "postgres://x:y@localhost:55436/appbuilder_test";
    expect(assertSafeTestDatabaseUrl({ APPBUILDER_TEST_DATABASE_URL: testUrl })).toBe(testUrl);
  });
});
