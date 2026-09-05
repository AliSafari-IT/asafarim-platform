import { describe, expect, it } from "vitest";
import { EnvValidationError, resolveEnv } from "./env";

const base = {
  NODE_ENV: "production",
  TASKSAI_ENVIRONMENT: "production",
  TASKSAI_DATABASE_URL: "postgres://tasksai:pw@db.internal:5432/tasksai",
  TASKSAI_REDIS_URL: "redis://cache.internal:6379",
  NEXT_PUBLIC_TASKSAI_URL: "https://tasks-ai.asafarim.com",
  NEXT_PUBLIC_HUB_URL: "https://hub.asafarim.com",
} satisfies Record<string, string>;

describe("resolveEnv", () => {
  it("resolves a well-formed production environment", () => {
    const env = resolveEnv(base, {});
    expect(env.environment).toBe("production");
    expect(env.requiresExplicitSecrets).toBe(true);
    expect(env.databaseUrl).toBe(base.TASKSAI_DATABASE_URL);
    expect(env.warnings).toEqual([]);
  });

  it("throws naming the variable when the database url is missing in production", () => {
    const { TASKSAI_DATABASE_URL: _omit, ...withoutDb } = base;
    try {
      resolveEnv(withoutDb, {});
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      expect((err as EnvValidationError).variables).toContain("TASKSAI_DATABASE_URL");
      expect((err as Error).message).not.toContain("pw");
    }
  });

  it("refuses a TasksAI database url equal to the platform DATABASE_URL", () => {
    const shared = "postgres://x:y@db/shared";
    expect(() =>
      resolveEnv({ ...base, TASKSAI_DATABASE_URL: shared, DATABASE_URL: `${shared}/` }, {}),
    ).toThrow(EnvValidationError);
  });

  it("falls back to local defaults in development without throwing", () => {
    const env = resolveEnv({ NODE_ENV: "development" }, {});
    expect(env.environment).toBe("development");
    expect(env.requiresExplicitSecrets).toBe(false);
    expect(env.databaseUrl).toContain("55438");
    expect(env.redisUrl).toContain("6390");
  });

  it("warns (does not throw) on loopback urls in production", () => {
    const env = resolveEnv(
      { ...base, NEXT_PUBLIC_TASKSAI_URL: "http://localhost:3013" },
      {},
    );
    expect(env.warnings.some((w) => w.includes("NEXT_PUBLIC_TASKSAI_URL"))).toBe(true);
  });

  it("uses build-time urls when runtime NEXT_PUBLIC_* are absent", () => {
    const { NEXT_PUBLIC_TASKSAI_URL: _a, NEXT_PUBLIC_HUB_URL: _b, ...rest } = base;
    const env = resolveEnv(rest, {
      appUrl: "https://tasks-ai.asafarim.com",
      hubUrl: "https://hub.asafarim.com",
    });
    expect(env.appUrl).toBe("https://tasks-ai.asafarim.com");
    expect(env.warnings).toEqual([]);
  });

  it("warns when the redis url is unset in production", () => {
    const { TASKSAI_REDIS_URL: _omit, ...rest } = base;
    const env = resolveEnv(rest, {});
    expect(env.warnings.some((w) => w.includes("TASKSAI_REDIS_URL"))).toBe(true);
    expect(env.redisUrl).toContain("6390");
  });
});
