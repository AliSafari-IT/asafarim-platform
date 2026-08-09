// Placeholder providers for apps with no seed implementation.
//
// These exist so every app on the platform is visible on the Seed Data page
// rather than silently absent. They never fake success: `supports` is all
// false, `availability` is "not-configured", every operation throws, and the
// status they report is explicitly "not-configured" — not "clean".

import { definitionChecksum } from "../checksums";
import type {
  SeedDatabaseKind,
  SeedPlan,
  SeedProvider,
  SeedResult,
  SeedStatus,
  ValidationResult,
} from "../contracts";
import { requiredEnvVars } from "../environments";

export interface UnavailableProviderInput {
  id: string;
  appId: string;
  displayName: string;
  /** Why there is nothing to seed yet. Shown verbatim on the card. */
  reason: string;
  databaseKind?: SeedDatabaseKind;
}

const GUIDANCE =
  "To manage seed data for this app, add a provider under packages/seed-manager/src/providers and register it in registry.ts. See docs/seed-management.md → “Adding a provider”.";

export function createUnavailableProvider(input: UnavailableProviderInput): SeedProvider {
  const databaseKind = input.databaseKind ?? "shared-prisma";
  const version = "0.0.0";
  const checksum = definitionChecksum({ id: input.id, unavailable: true });

  const refuse = (): never => {
    throw new Error(`${input.displayName} has no seed provider configured.`);
  };

  return {
    id: input.id,
    appId: input.appId,
    displayName: input.displayName,
    description: input.reason,
    databaseKind,
    availability: "not-configured",
    protected: false,
    definitionVersion: version,
    requiredEnv: requiredEnvVars(databaseKind),
    supports: {
      validate: false,
      status: false,
      seed: false,
      reconcile: false,
      remove: false,
    },
    manifest: [],
    externalLink: {
      label: "How to add a provider",
      href: "/seed-data#adding-a-provider",
      note: GUIDANCE,
    },

    async validate(): Promise<ValidationResult> {
      return {
        ok: false,
        definitionVersion: version,
        definitionChecksum: checksum,
        connection: "unconfigured",
        issues: [
          { code: "NOT_CONFIGURED", severity: "info", message: input.reason },
          { code: "PROVIDER_GUIDANCE", severity: "info", message: GUIDANCE },
        ],
        checkedAt: new Date().toISOString(),
        durationMs: 0,
      };
    },

    async inspect(): Promise<SeedStatus> {
      return {
        health: "not-configured",
        definitionVersion: version,
        definitionChecksum: checksum,
        connection: "unconfigured",
        seedOwnedCount: 0,
        missingCount: 0,
        driftedCount: 0,
        orphanedCount: 0,
        entities: [],
        issues: [{ code: "NOT_CONFIGURED", severity: "info", message: input.reason }],
        checkedAt: new Date().toISOString(),
        durationMs: 0,
      };
    },

    async plan(): Promise<SeedPlan> {
      return refuse();
    },

    async execute(): Promise<SeedResult> {
      return refuse();
    },
  };
}
