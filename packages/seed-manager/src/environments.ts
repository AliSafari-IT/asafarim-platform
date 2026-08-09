// Server-only environment resolution.
//
// The browser can send an environment *id* and nothing else. This module is
// the only place that turns that id into a connection string, and it does so
// from an allowlisted table of environment-variable names. There is no code
// path anywhere in the package that accepts a host, a URL or a credential
// from a caller.

import { existsSync } from "node:fs";

import type { SeedDatabaseKind, SeedEnvironment } from "./contracts";
import { SEED_ENVIRONMENTS } from "./contracts";

/**
 * Which env var holds the connection string, per database and environment.
 * Adding a row here is the only supported way to make a new target
 * reachable — see docs/seed-management.md.
 */
const CONNECTION_ENV_VARS: Record<
  SeedDatabaseKind,
  Record<SeedEnvironment, string>
> = {
  "shared-prisma": {
    development: "DATABASE_URL",
    staging: "SEED_MANAGER_STAGING_DATABASE_URL",
    production: "SEED_MANAGER_PRODUCTION_DATABASE_URL",
  },
  "testora-drizzle": {
    development: "TESTORA_DATABASE_URL",
    staging: "SEED_MANAGER_STAGING_TESTORA_DATABASE_URL",
    production: "SEED_MANAGER_PRODUCTION_TESTORA_DATABASE_URL",
  },
  "appbuilder-drizzle": {
    development: "APPBUILDER_DATABASE_URL",
    staging: "SEED_MANAGER_STAGING_APPBUILDER_DATABASE_URL",
    production: "SEED_MANAGER_PRODUCTION_APPBUILDER_DATABASE_URL",
  },
};

export function isSeedEnvironment(value: unknown): value is SeedEnvironment {
  return (
    typeof value === "string" &&
    (SEED_ENVIRONMENTS as readonly string[]).includes(value)
  );
}

/** The env var names a database/environment pair needs. Names, never values. */
export function requiredEnvVars(
  databaseKind: SeedDatabaseKind
): Partial<Record<SeedEnvironment, string[]>> {
  const row = CONNECTION_ENV_VARS[databaseKind];
  return Object.fromEntries(
    SEED_ENVIRONMENTS.map((env) => [env, [row[env]]])
  ) as Partial<Record<SeedEnvironment, string[]>>;
}

export type ConnectionResolution =
  | { ok: true; connectionString: string; envVar: string }
  | { ok: false; envVar: string; reason: "missing" | "malformed" };

/**
 * Resolve a connection string. Mirrors the host-rewriting the existing CLI
 * seeds do: when the URL points at the docker-compose service name but we
 * are not inside a container, `postgres` will not resolve, so fall back to
 * localhost (the port is published in docker-compose).
 */
export function resolveConnection(
  databaseKind: SeedDatabaseKind,
  environment: SeedEnvironment,
  env: NodeJS.ProcessEnv = process.env
): ConnectionResolution {
  const envVar = CONNECTION_ENV_VARS[databaseKind][environment];
  const raw = env[envVar];
  if (!raw || !raw.trim()) return { ok: false, envVar, reason: "missing" };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, envVar, reason: "malformed" };
  }

  if (!existsSync("/.dockerenv") && url.hostname === "postgres") {
    url.hostname = "localhost";
  }
  return { ok: true, connectionString: url.toString(), envVar };
}

/**
 * Production is off unless the operator opted in on the server. Checked
 * again immediately before execution, not only at page render.
 */
export function isProductionSeedingEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.SEED_MANAGER_PRODUCTION_ENABLED === "true";
}

/** Per-provider timeout, bounded so a hung provider cannot pin a worker. */
export function resolveTimeoutMs(
  providerId: string,
  env: NodeJS.ProcessEnv = process.env
): number {
  const key = `SEED_MANAGER_TIMEOUT_MS_${providerId.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
  const raw = env[key] ?? env.SEED_MANAGER_TIMEOUT_MS;
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.max(parsed, 5_000), MAX_TIMEOUT_MS);
}

export const DEFAULT_TIMEOUT_MS = 120_000;
export const MAX_TIMEOUT_MS = 900_000;
