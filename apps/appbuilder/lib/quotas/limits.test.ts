import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  QUOTA_LIMITS,
  QUOTA_METRICS,
  QUOTA_METRIC_SCOPE,
  resolveDefaultLimit,
} from "./limits";

describe("quota limits catalogue", () => {
  it("defines a default limit and a scope for every catalogued metric", () => {
    for (const metric of QUOTA_METRICS) {
      expect(QUOTA_LIMITS[metric]).toBeGreaterThan(0);
      expect(["owner", "app"]).toContain(QUOTA_METRIC_SCOPE[metric]);
    }
  });

  it("has no duplicate metrics", () => {
    expect(new Set(QUOTA_METRICS).size).toBe(QUOTA_METRICS.length);
  });
});

describe("resolveDefaultLimit", () => {
  const key = "APPBUILDER_QUOTA_APPS_PER_OWNER";
  const original = process.env[key];

  afterEach(() => {
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  });

  it("falls back to the built-in default when no env override is set", () => {
    delete process.env[key];
    expect(resolveDefaultLimit("apps_per_owner")).toBe(
      QUOTA_LIMITS.apps_per_owner
    );
  });

  it("honors a valid env override", () => {
    process.env[key] = "5";
    expect(resolveDefaultLimit("apps_per_owner")).toBe(5);
  });

  it("ignores a malformed env override and falls back to the default", () => {
    process.env[key] = "not-a-number";
    expect(resolveDefaultLimit("apps_per_owner")).toBe(
      QUOTA_LIMITS.apps_per_owner
    );
  });

  it("ignores a negative env override", () => {
    process.env[key] = "-1";
    expect(resolveDefaultLimit("apps_per_owner")).toBe(
      QUOTA_LIMITS.apps_per_owner
    );
  });
});
