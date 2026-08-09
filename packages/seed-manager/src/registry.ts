// The provider allowlist.
//
// A provider id is the *only* thing the browser sends to identify a target,
// and it is resolved here or rejected. There is no dynamic import, no lookup
// by path, and no way to reach a provider that is not in this array.

import type { SeedEnvironment, SeedProvider, SeedProviderContext } from "./contracts";
import {
  DEFAULT_TIMEOUT_MS,
  resolveConnection,
  resolveTimeoutMs,
} from "./environments";
import { appbuilderProvider } from "./providers/appbuilder";
import { edumatchProvider } from "./providers/edumatch";
import { platformFoundationProvider } from "./providers/platform-foundation";
import { testoraProvider } from "./providers/testora";
import { timelineaiProvider } from "./providers/timelineai";
import { createUnavailableProvider } from "./providers/unavailable";

/**
 * Every app on the platform appears here, in display order. Apps without a
 * seed implementation get an explicit "not configured" entry rather than
 * being omitted — an app missing from this page would be indistinguishable
 * from an app with nothing to seed.
 */
export const SEED_PROVIDERS: readonly SeedProvider[] = Object.freeze([
  platformFoundationProvider,
  createUnavailableProvider({
    id: "admin",
    appId: "admin",
    displayName: "Admin Console",
    reason:
      "The Admin Console reads the shared platform database and owns no seed data of its own. Its roles and permissions are managed by the platform foundation provider above.",
  }),
  createUnavailableProvider({
    id: "hub",
    appId: "hub",
    displayName: "Hub",
    reason:
      "Hub is the sign-in gateway and stores no product data. Accounts are created through sign-up, not seeding.",
  }),
  createUnavailableProvider({
    id: "web",
    appId: "web",
    displayName: "ASafarIM Digital",
    reason:
      "The public site renders content from code and the shared database; it has no deterministic seed dataset yet.",
  }),
  createUnavailableProvider({
    id: "showcase",
    appId: "showcase",
    displayName: "Showcase",
    reason:
      "Showcase renders its gallery from committed project metadata rather than seeded rows, so there is nothing to reconcile.",
  }),
  edumatchProvider,
  createUnavailableProvider({
    id: "vionto",
    appId: "vionto",
    displayName: "Vionto",
    reason:
      "Vionto's projects, albums and renders are all user-generated. No synthetic dataset is defined, and none should be created by seeding.",
  }),
  timelineaiProvider,
  testoraProvider,
  appbuilderProvider,
]);

const BY_ID = new Map(SEED_PROVIDERS.map((provider) => [provider.id, provider]));

/** Duplicate ids would make the allowlist ambiguous — fail loudly at import. */
if (BY_ID.size !== SEED_PROVIDERS.length) {
  throw new Error("Duplicate provider id in the seed-manager registry.");
}

export function listProviders(): readonly SeedProvider[] {
  return SEED_PROVIDERS;
}

export function isProviderId(value: unknown): value is string {
  return typeof value === "string" && BY_ID.has(value);
}

/** Resolve an allowlisted id, or `null`. Never throws on bad input. */
export function getProvider(id: string): SeedProvider | null {
  return BY_ID.get(id) ?? null;
}

export function configuredProviders(): SeedProvider[] {
  return SEED_PROVIDERS.filter((provider) => provider.availability === "configured");
}

/**
 * Providers eligible for a bulk action. Protected providers are excluded from
 * removal automatically, and unavailable providers are never included — the
 * caller reports them as skipped rather than counting them as successful.
 */
export function bulkTargets(operation: "validate" | "status" | "seed" | "reconcile" | "remove") {
  return configuredProviders().filter((provider) => {
    if (operation === "remove" && provider.protected) return false;
    return provider.supports[operation];
  });
}

export type ContextResolution =
  | { ok: true; context: SeedProviderContext }
  | { ok: false; code: "NOT_CONFIGURED" | "MISSING_ENV" | "MALFORMED_ENV"; reason: string };

/**
 * Build the execution context for a provider/environment pair. This is the
 * only place a connection string enters the system, and it is never returned
 * to a caller that renders to the client.
 */
export function resolveContext(
  provider: SeedProvider,
  environment: SeedEnvironment,
  options: {
    signal?: AbortSignal;
    report?: SeedProviderContext["report"];
    env?: NodeJS.ProcessEnv;
  } = {}
): ContextResolution {
  const env = options.env ?? process.env;

  if (provider.availability !== "configured") {
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      reason: `${provider.displayName} has no seed provider configured.`,
    };
  }

  const resolved = resolveConnection(provider.databaseKind, environment, env);
  if (!resolved.ok) {
    return resolved.reason === "missing"
      ? {
          ok: false,
          code: "MISSING_ENV",
          // The variable *name* is safe to surface; its value never is.
          reason: `${resolved.envVar} is not set on the server, so ${provider.displayName} cannot be reached in ${environment}.`,
        }
      : {
          ok: false,
          code: "MALFORMED_ENV",
          reason: `${resolved.envVar} is not a valid connection URL.`,
        };
  }

  return {
    ok: true,
    context: {
      environment,
      connectionString: resolved.connectionString,
      timeoutMs: resolveTimeoutMs(provider.id, env) || DEFAULT_TIMEOUT_MS,
      signal: options.signal,
      report: options.report,
    },
  };
}
