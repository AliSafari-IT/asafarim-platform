import { describe, expect, it } from "vitest";
import {
  assertNotProduction,
  resolveSourceUrl,
  resolveTargetUrl,
} from "./safety";

const PROD_URL = "postgres://appbuilder:secret@db.internal:5432/appbuilder";

describe("resolveSourceUrl", () => {
  it("falls back to the local dev default when unset", () => {
    expect(resolveSourceUrl({})).toContain("127.0.0.1:55436/appbuilder");
  });

  it("honors APPBUILDER_DATABASE_URL", () => {
    expect(resolveSourceUrl({ APPBUILDER_DATABASE_URL: PROD_URL })).toBe(
      PROD_URL
    );
  });
});

describe("resolveTargetUrl", () => {
  it("defaults to a sibling '_restore_rehearsal' database on the SAME server as the source", () => {
    const target = resolveTargetUrl(PROD_URL, {});
    expect(new URL(target).pathname).toBe("/appbuilder_restore_rehearsal");
    expect(new URL(target).hostname).toBe("db.internal");
  });

  it("honors an explicit override", () => {
    const override = "postgres://x:y@localhost/scratch_restore_test";
    expect(
      resolveTargetUrl(PROD_URL, {
        APPBUILDER_RESTORE_REHEARSAL_DATABASE_URL: override,
      })
    ).toBe(override);
  });
});

/**
 * This is THE guard preventing lib/backup/runRestoreRehearsal.ts from ever
 * running `DROP DATABASE` / `pg_restore` against the real production
 * database — see M12 acceptance criteria "do not perform destructive
 * restoration against production." Three independent, redundant checks are
 * each tested directly.
 */
describe("assertNotProduction", () => {
  it("refuses when the target is byte-identical to the source", () => {
    expect(() => assertNotProduction(PROD_URL, PROD_URL)).toThrow(
      /identical to APPBUILDER_DATABASE_URL/
    );
  });

  it("refuses when the target database name matches the source's, even on a different host", () => {
    const target = "postgres://x:y@other-host:5432/appbuilder";
    expect(() => assertNotProduction(PROD_URL, target)).toThrow(
      /matches the production database name/
    );
  });

  it("refuses a target whose name doesn't look like a scratch database, even if otherwise distinct", () => {
    const target = "postgres://x:y@db.internal:5432/appbuilder_staging";
    expect(() => assertNotProduction(PROD_URL, target)).toThrow(
      /doesn't look like a scratch database/
    );
  });

  it("allows a target that is distinct, differently named, and clearly a scratch database", () => {
    const target =
      "postgres://x:y@db.internal:5432/appbuilder_restore_rehearsal";
    expect(() => assertNotProduction(PROD_URL, target)).not.toThrow();
  });

  it("allows a 'test' or 'restore'-named scratch database too", () => {
    expect(() =>
      assertNotProduction(
        PROD_URL,
        "postgres://x:y@db.internal:5432/appbuilder_test"
      )
    ).not.toThrow();
    expect(() =>
      assertNotProduction(
        PROD_URL,
        "postgres://x:y@db.internal:5432/my_restore_scratch"
      )
    ).not.toThrow();
  });
});
