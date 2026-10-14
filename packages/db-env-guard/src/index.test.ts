import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PLATFORM_DATABASE,
  TASKSAI_DATABASE,
  checkCanMarkDatabase,
  checkDatabaseMarker,
  checkMarkRequest,
  decideDatabaseEnvironment,
  markDatabaseSql,
  parseDatabaseMarker,
  type DatabaseProfile,
} from "./index";

const laptop = { machineHostname: "dev-laptop", cwd: "C:/repos/asafarim-platform/packages/db" };

const profiles: { profile: DatabaseProfile; dev: string; prodLoopback: string; composeUrl: string }[] = [
  {
    profile: PLATFORM_DATABASE,
    dev: "postgresql://asafarim:pw@localhost:55435/asafarim",
    prodLoopback: "postgresql://asafarim:pw@localhost:5432/asafarim",
    composeUrl: "postgresql://asafarim:pw@postgres:5432/asafarim",
  },
  {
    profile: TASKSAI_DATABASE,
    dev: "postgres://tasksai:tasksai_dev@127.0.0.1:55438/tasksai",
    prodLoopback: "postgres://tasksai:x@127.0.0.1:5438/tasksai",
    composeUrl: "postgres://tasksai:x@tasksai-postgres:5432/tasksai",
  },
];

describe.each(profiles)("static signals, $profile.displayName database (fail closed)", ({ profile, dev, prodLoopback, composeUrl }) => {
  const decide = (input: Parameters<typeof decideDatabaseEnvironment>[1]) => decideDatabaseEnvironment(profile, input);

  it("allows loopback on the development port", () => {
    expect(decide({ rawDatabaseUrl: dev, ...laptop })).toMatchObject({ ok: true, environment: "development" });
  });

  it("treats loopback on any other port, the default included, as PRODUCTION (production host, or an SSH tunnel to it)", () => {
    const host = new URL(dev).hostname;
    for (const url of [
      prodLoopback,
      dev.replace(/:\d+\//, ":5432/"),
      dev.replace(/:\d+\//, "/"),
      dev.replace(`@${host}:`, "@[::1]:").replace(/:\d+\//, ":6543/"),
      dev.replace(`@${host}:`, "@127.0.0.1:").replace(/:\d+\//, "/"),
    ]) {
      const decision = decide({ rawDatabaseUrl: url, ...laptop });
      expect(decision.ok, url).toBe(false);
      expect(!decision.ok && decision.reason).toMatch(/PRODUCTION.*loopback/);
      expect(!decision.ok && decision.reason).toContain(`PRODUCTION ${profile.displayName} database`);
    }
  });

  it("refuses on the production host even with the development URL (hostname, or the deploy checkout, Windows slashes too)", () => {
    for (const machine of [
      { machineHostname: "asafarim", cwd: "/home/x" },
      { machineHostname: "other", cwd: "/var/repos/asafarim-com/packages/db" },
      { machineHostname: "other", cwd: "\\var\\repos\\asafarim-com\\apps\\tasks-ai" },
    ]) {
      const decision = decide({ rawDatabaseUrl: dev, ...machine });
      expect(decision.ok).toBe(false);
      expect(!decision.ok && decision.reason).toMatch(/production host/);
    }
  });

  it("refuses the production compose host and NODE_ENV=production without the owner flag", () => {
    const compose = decide({ rawDatabaseUrl: composeUrl, ...laptop });
    expect(!compose.ok && compose.reason).toContain(`the production compose host "${profile.productionComposeHost}"`);
    const nodeEnv = decide({ rawDatabaseUrl: dev, nodeEnv: "production", ...laptop });
    expect(!nodeEnv.ok && nodeEnv.reason).toMatch(/NODE_ENV=production/);
  });

  it("lists every production signal that fired", () => {
    const decision = decide({ rawDatabaseUrl: prodLoopback, nodeEnv: "production", machineHostname: "asafarim" });
    expect(!decision.ok && decision.reason).toMatch(/NODE_ENV=production; loopback on port \d+.*; running on the production host/);
  });

  it("with --allow-production-baseline, production is allowed as production", () => {
    expect(decide({ rawDatabaseUrl: composeUrl, allowProductionBaseline: true, ...laptop })).toMatchObject({ ok: true, environment: "production" });
    expect(decide({ rawDatabaseUrl: prodLoopback, allowProductionBaseline: true, ...laptop })).toMatchObject({ ok: true, environment: "production" });
    expect(decide({ rawDatabaseUrl: composeUrl, allowProductionBaseline: true })).toMatchObject({ ok: true, environment: "production" });
  });

  it("rejects the owner flag on the development database and on a remote test database", () => {
    expect(decide({ rawDatabaseUrl: dev, allowProductionBaseline: true, ...laptop }).ok).toBe(false);
    const remote = "postgres://u:x@db.tasks-test.example:5432/x";
    expect(decide({ rawDatabaseUrl: remote, confirmHost: "db.tasks-test.example", allowProductionBaseline: true, ...laptop }).ok).toBe(false);
  });

  it("needs --confirm-host for a remote test environment, matching the URL's host", () => {
    const remote = "postgres://u:x@db.tasks-test.example:5432/x";
    expect(decide({ rawDatabaseUrl: remote, ...laptop }).ok).toBe(false);
    expect(decide({ rawDatabaseUrl: remote, confirmHost: "other.example", ...laptop }).ok).toBe(false);
    expect(decide({ rawDatabaseUrl: remote, confirmHost: "db.tasks-test.example", ...laptop })).toMatchObject({
      ok: true,
      environment: "test",
      host: "db.tasks-test.example",
    });
  });

  it("refuses an invalid URL, naming the profile's variable", () => {
    expect(decide({ rawDatabaseUrl: "not a url" })).toEqual({ ok: false, reason: `${profile.urlEnvVar} is not a valid URL.` });
  });
});

describe("the platform database is never a write target for another CLI", () => {
  it("refuses a URL naming the platform database (same host, port and path), even on a dev port", () => {
    const platform = "postgresql://asafarim:pw@localhost:55435/asafarim";
    const decision = decideDatabaseEnvironment(TASKSAI_DATABASE, { rawDatabaseUrl: platform, platformDatabaseUrl: platform, ...laptop });
    expect(decision.ok).toBe(false);
    expect(!decision.ok && decision.reason).toMatch(/TASKSAI_DATABASE_URL points at the platform database/);
  });

  it("compares the default port and ignores credentials", () => {
    const decision = decideDatabaseEnvironment(TASKSAI_DATABASE, {
      rawDatabaseUrl: "postgres://other:pw@db.example/asafarim",
      platformDatabaseUrl: "postgresql://asafarim:secret@db.example:5432/asafarim",
      confirmHost: "db.example",
    });
    expect(!decision.ok && decision.reason).toMatch(/platform database/);
  });

  it("a different database, or an unparsable platform URL, is not the platform database", () => {
    const dev = "postgres://tasksai:x@127.0.0.1:55438/tasksai";
    expect(decideDatabaseEnvironment(TASKSAI_DATABASE, { rawDatabaseUrl: dev, platformDatabaseUrl: "postgresql://a:b@localhost:55435/asafarim", ...laptop }).ok).toBe(true);
    expect(decideDatabaseEnvironment(TASKSAI_DATABASE, { rawDatabaseUrl: dev, platformDatabaseUrl: "::", ...laptop }).ok).toBe(true);
  });
});

describe("docker-compose.yml pins the development ports (fails if one changes)", () => {
  const compose = readFileSync(path.resolve(__dirname, "../../../docker-compose.yml"), "utf8");
  const publishedPorts = (service: string) => {
    const start = compose.indexOf(`\n  ${service}:\n`);
    expect(start, service).toBeGreaterThanOrEqual(0);
    const next = compose.slice(start + 1).search(/\n {2}[a-z][a-z0-9-]*:\n/);
    const block = compose.slice(start, next === -1 ? undefined : start + 1 + next);
    return [...block.matchAll(/-\s*"(?:127\.0\.0\.1:)?(\d+):5432"/g)].map((m) => m[1]);
  };

  it("platform: service postgres", () => {
    expect(publishedPorts("postgres")).toEqual([...PLATFORM_DATABASE.devPorts]);
  });

  it("TasksAI: service tasksai-postgres", () => {
    expect(publishedPorts("tasksai-postgres")).toEqual([...TASKSAI_DATABASE.devPorts]);
  });
});

describe("the database's own marker", () => {
  it("parses the marker from the database comment", () => {
    expect(parseDatabaseMarker("asafarim-env=development")).toBe("development");
    expect(parseDatabaseMarker("notes; asafarim-env=test")).toBe("test");
    expect(parseDatabaseMarker("asafarim-env=production")).toBe("production");
    expect(parseDatabaseMarker("")).toBeNull();
    expect(parseDatabaseMarker(null)).toBeNull();
    expect(parseDatabaseMarker(undefined)).toBeNull();
  });

  it("development/test need their marker; a missing or other marker refuses", () => {
    expect(checkDatabaseMarker("development", "development")).toEqual({ ok: true });
    expect(checkDatabaseMarker("test", "test")).toEqual({ ok: true });
    const missing = checkDatabaseMarker("development", null);
    expect(!missing.ok && missing.reason).toMatch(/--mark-database=development/);
    expect(checkDatabaseMarker("development", "test").ok).toBe(false);
    expect(checkDatabaseMarker("test", "development").ok).toBe(false);
  });

  it("production refuses a database marked development/test (signals disagree)", () => {
    expect(checkDatabaseMarker("production", null)).toEqual({ ok: true });
    expect(checkDatabaseMarker("production", "production")).toEqual({ ok: true });
    expect(checkDatabaseMarker("production", "development").ok).toBe(false);
    expect(checkDatabaseMarker("production", "test").ok).toBe(false);
  });
});

describe("the deploy's positive production marker (#747)", () => {
  it.each(profiles)("a dev-loopback URL on a database marked production is refused ($profile.displayName)", ({ profile, dev }) => {
    const decision = decideDatabaseEnvironment(profile, { rawDatabaseUrl: dev, ...laptop });
    expect(decision).toMatchObject({ ok: true, environment: "development" }); // URL + machine pass…
    const db = checkDatabaseMarker(decision.ok ? decision.environment : "development", "production");
    expect(db.ok).toBe(false); // …the database's own stamp refuses
    expect(!db.ok && db.reason).toMatch(/marked "production"/);
  });

  it("a test database marked production is refused too", () => {
    expect(checkDatabaseMarker("test", "production").ok).toBe(false);
  });

  it("--mark-database never overwrites a production marker", () => {
    expect(checkCanMarkDatabase("production").ok).toBe(false);
    expect(checkCanMarkDatabase(null)).toEqual({ ok: true });
    expect(checkCanMarkDatabase("development")).toEqual({ ok: true });
    expect(checkCanMarkDatabase("test")).toEqual({ ok: true });
  });
});

describe("--mark-database requests", () => {
  it("accepts only the environment the static checks decided, never production", () => {
    expect(checkMarkRequest("development", "development")).toEqual({ ok: true, environment: "development" });
    expect(checkMarkRequest("test", "test")).toEqual({ ok: true, environment: "test" });
    expect(checkMarkRequest("test", "development")).toEqual({
      ok: false,
      reason: '--mark-database=test refused: the URL/machine checks say this is "development".',
    });
    expect(checkMarkRequest("production", "production").ok).toBe(false);
    expect(checkMarkRequest("development", "production").ok).toBe(false);
  });

  it("builds the COMMENT statement with the name quoted as an identifier", () => {
    expect(markDatabaseSql("tasksai", "development")).toBe(`COMMENT ON DATABASE "tasksai" IS 'asafarim-env=development'`);
    expect(markDatabaseSql('we"ird', "test")).toBe(`COMMENT ON DATABASE "we""ird" IS 'asafarim-env=test'`);
  });

  it("refuses to build a production stamp, even past the type system", () => {
    expect(() => markDatabaseSql("x", "production" as never)).toThrow(/production/);
  });
});
