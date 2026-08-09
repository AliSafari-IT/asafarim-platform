import { describe, expect, it } from "vitest";

import {
  bulkTargets,
  configuredProviders,
  getProvider,
  isProviderId,
  listProviders,
  resolveContext,
} from "./registry";
import { SEED_OPERATION_KINDS } from "./contracts";

describe("provider registry", () => {
  it("exposes unique provider ids", () => {
    const ids = listProviders().map((provider) => provider.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers every platform app, including apps with no seed data", () => {
    const appIds = listProviders().map((provider) => provider.appId);
    for (const app of [
      "platform",
      "admin",
      "hub",
      "web",
      "showcase",
      "edumatch",
      "vionto",
      "timelineai",
      "testora",
      "appbuilder",
    ]) {
      expect(appIds).toContain(app);
    }
  });

  it("configures exactly the five providers this release supports", () => {
    expect(configuredProviders().map((p) => p.id).sort()).toEqual([
      "appbuilder",
      "edumatch",
      "platform-foundation",
      "testora",
      "timelineai",
    ]);
  });

  it("rejects ids outside the allowlist", () => {
    for (const candidate of ["", "../providers/testora", "platform_foundation", "DROP TABLE", null, 42]) {
      expect(isProviderId(candidate)).toBe(false);
      if (typeof candidate === "string") expect(getProvider(candidate)).toBeNull();
    }
  });

  it("declares a supports flag for every operation kind", () => {
    for (const provider of listProviders()) {
      for (const kind of SEED_OPERATION_KINDS) {
        expect(typeof provider.supports[kind]).toBe("boolean");
      }
    }
  });

  it("never lists an unconfigured provider as a bulk target", () => {
    for (const operation of ["validate", "status", "seed", "reconcile", "remove"] as const) {
      for (const provider of bulkTargets(operation)) {
        expect(provider.availability).toBe("configured");
        expect(provider.supports[operation]).toBe(true);
      }
    }
  });

  it("excludes protected providers from bulk removal", () => {
    expect(bulkTargets("remove").some((provider) => provider.protected)).toBe(false);
  });

  it("refuses to build a context for an unconfigured provider", () => {
    const provider = getProvider("hub")!;
    const result = resolveContext(provider, "development", { env: {} });
    expect(result).toMatchObject({ ok: false, code: "NOT_CONFIGURED" });
  });

  it("names the missing environment variable without leaking its value", () => {
    const provider = getProvider("timelineai")!;
    const result = resolveContext(provider, "staging", { env: {} });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("MISSING_ENV");
    expect(result.reason).toContain("SEED_MANAGER_STAGING_DATABASE_URL");
  });

  it("resolves a connection only from the allowlisted variable for that environment", () => {
    const provider = getProvider("timelineai")!;
    const result = resolveContext(provider, "development", {
      env: {
        DATABASE_URL: "postgresql://u:p@localhost:5432/db",
        SEED_MANAGER_PRODUCTION_DATABASE_URL: "postgresql://u:p@prod:5432/db",
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.context.connectionString).toContain("localhost");
    expect(result.context.environment).toBe("development");
  });
});

describe("unavailable providers", () => {
  const unavailable = listProviders().filter((p) => p.availability === "not-configured");

  it("never claims to support an operation", () => {
    for (const provider of unavailable) {
      expect(Object.values(provider.supports).every((value) => value === false)).toBe(true);
    }
  });

  it("reports not-configured rather than clean", async () => {
    for (const provider of unavailable) {
      const status = await provider.inspect({
        environment: "development",
        connectionString: "unused",
        timeoutMs: 1000,
      });
      expect(status.health).toBe("not-configured");
      expect(status.seedOwnedCount).toBe(0);
    }
  });

  it("throws rather than silently succeeding when asked to mutate", async () => {
    for (const provider of unavailable) {
      await expect(
        provider.plan({ environment: "development", connectionString: "unused", timeoutMs: 1000 }, "seed")
      ).rejects.toThrow();
      await expect(
        provider.execute(
          { environment: "development", connectionString: "unused", timeoutMs: 1000 },
          {} as never
        )
      ).rejects.toThrow();
    }
  });

  it("fails validation instead of reporting ok", async () => {
    for (const provider of unavailable) {
      const result = await provider.validate({
        environment: "development",
        connectionString: "unused",
        timeoutMs: 1000,
      });
      expect(result.ok).toBe(false);
      expect(result.connection).toBe("unconfigured");
    }
  });
});
