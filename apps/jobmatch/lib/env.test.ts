import { describe, expect, it } from "vitest";
import { EnvValidationError, resolveEnv } from "./env";

describe("JobMatch environment contract", () => {
  it("defaults to the local JobMatch database in development", () => {
    const env = resolveEnv({ NODE_ENV: "development" });
    expect(env.environment).toBe("development");
    expect(env.databaseUrl).toContain(":55437/jobmatch");
    expect(env.requiresExplicitSecrets).toBe(false);
  });

  it("does not refuse to serve over a missing public URL — it warns", () => {
    // This is the production incident. NEXT_PUBLIC_* values are inlined by
    // Next at build time and are absent from the server's runtime env when
    // they are passed as build args, so requiring them at runtime threw on
    // every request and took the deployed app down. A wrong link is worth
    // shouting about; it is not worth an outage.
    const env = resolveEnv(
      {
        NODE_ENV: "production",
        JOBMATCH_DATABASE_URL: "postgresql://jobmatch:pw@jobmatch-postgres:5432/jobmatch",
      },
      {},
    );
    expect(env.environment).toBe("production");
    expect(env.warnings).toHaveLength(2);
    expect(env.warnings.join(" ")).toContain("NEXT_PUBLIC_JOBMATCH_URL");
    expect(env.warnings.join(" ")).toContain("NEXT_PUBLIC_HUB_URL");
  });

  it("uses the value Next inlined at build when no runtime variable exists", () => {
    // The deployed shape: the URL reached the build as an arg and never
    // reaches the server's process.env.
    const env = resolveEnv(
      {
        NODE_ENV: "production",
        JOBMATCH_DATABASE_URL: "postgresql://jobmatch:pw@jobmatch-postgres:5432/jobmatch",
      },
      { appUrl: "https://jobmatch.asafarim.com", hubUrl: "https://hub.asafarim.com" },
    );
    expect(env.appUrl).toBe("https://jobmatch.asafarim.com");
    expect(env.hubUrl).toBe("https://hub.asafarim.com");
    expect(env.warnings).toEqual([]);
  });

  it("lets a runtime variable override the build-time value", () => {
    const env = resolveEnv(
      {
        NODE_ENV: "production",
        JOBMATCH_DATABASE_URL: "postgresql://jobmatch:pw@db:5432/jobmatch",
        NEXT_PUBLIC_JOBMATCH_URL: "https://staging.jobmatch.asafarim.com",
      },
      { appUrl: "https://jobmatch.asafarim.com", hubUrl: "https://hub.asafarim.com" },
    );
    expect(env.appUrl).toBe("https://staging.jobmatch.asafarim.com");
  });

  it("warns when a deployed URL still points at loopback", () => {
    const env = resolveEnv(
      {
        NODE_ENV: "production",
        JOBMATCH_DATABASE_URL: "postgresql://jobmatch:pw@db:5432/jobmatch",
      },
      { appUrl: "http://localhost:3012", hubUrl: "https://hub.asafarim.com" },
    );
    expect(env.warnings).toHaveLength(1);
    expect(env.warnings[0]).toContain("NEXT_PUBLIC_JOBMATCH_URL");
  });

  it("says nothing about loopback URLs in development, where they are correct", () => {
    expect(resolveEnv({ NODE_ENV: "development" }, {}).warnings).toEqual([]);
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
