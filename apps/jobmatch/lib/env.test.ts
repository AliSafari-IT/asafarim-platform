import { describe, expect, it } from "vitest";
import { EnvValidationError, resolveEnv } from "./env";

describe("JobMatch environment contract", () => {
  it("defaults to the local JobMatch database in development", () => {
    const env = resolveEnv({ NODE_ENV: "development" });
    expect(env.environment).toBe("development");
    expect(env.databaseUrl).toContain(":55437/jobmatch");
    expect(env.requiresExplicitSecrets).toBe(false);
  });

  it("refuses to boot deployed without the URLs the sign-in redirect depends on", () => {
    // A localhost hub URL in production is a broken auth flow that only
    // shows up once real users are redirected to it.
    try {
      resolveEnv({
        NODE_ENV: "production",
        JOBMATCH_DATABASE_URL: "postgresql://jobmatch:pw@jobmatch-postgres:5432/jobmatch",
      });
      throw new Error("expected a validation failure");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect((error as EnvValidationError).variables).toEqual([
        "NEXT_PUBLIC_HUB_URL",
        "NEXT_PUBLIC_JOBMATCH_URL",
      ]);
    }
  });

  it("refuses to boot staging or production without an explicit database url", () => {
    for (const source of [
      { NODE_ENV: "production" as const },
      { NODE_ENV: "production" as const, JOBMATCH_ENVIRONMENT: "staging" as const },
    ]) {
      expect(() => resolveEnv(source)).toThrow(EnvValidationError);
    }
  });

  it("never puts a secret value into the error message", () => {
    try {
      resolveEnv({ NODE_ENV: "production", NEXT_PUBLIC_HUB_URL: "not-a-url" });
      throw new Error("expected a validation failure");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      const message = (error as Error).message;
      expect(message).toContain("NEXT_PUBLIC_HUB_URL");
      expect(message).not.toContain("not-a-url");
    }
  });

  it("does not fall back to the shared platform database url", () => {
    // The platform DATABASE_URL is present in every deployed environment.
    // If it were ever accepted here, JobMatch's ingestion and CV tables
    // would land in the identity database.
    expect(() =>
      resolveEnv({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://asafarim:pw@postgres:5432/asafarim",
      } as Record<string, string>),
    ).toThrow(EnvValidationError);
  });

  it("accepts a fully configured production environment", () => {
    const env = resolveEnv({
      NODE_ENV: "production",
      JOBMATCH_DATABASE_URL: "postgresql://jobmatch:pw@jobmatch-postgres:5432/jobmatch",
      NEXT_PUBLIC_JOBMATCH_URL: "https://jobmatch.asafarim.com",
      NEXT_PUBLIC_HUB_URL: "https://hub.asafarim.com",
    });
    expect(env.environment).toBe("production");
    expect(env.appUrl).toBe("https://jobmatch.asafarim.com");
    expect(env.hubUrl).toBe("https://hub.asafarim.com");
  });
});
