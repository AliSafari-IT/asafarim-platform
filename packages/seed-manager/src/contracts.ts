// The seed-manager provider contract.
//
// Everything the Admin Console knows about seeding flows through these types.
// Providers never receive a connection string, a table name, a script path or
// a command from the caller — only an allowlisted environment id, which the
// provider resolves against server-only configuration itself. See
// ./environments.ts for that resolution and ./safety.ts for the guards.

export const SEED_ENVIRONMENTS = ["development", "staging", "production"] as const;
export type SeedEnvironment = (typeof SEED_ENVIRONMENTS)[number];

export const SEED_OPERATION_KINDS = [
  "validate",
  "status",
  "seed",
  "reconcile",
  "remove",
] as const;
export type SeedOperationKind = (typeof SEED_OPERATION_KINDS)[number];

/** Operations that may write. Everything else is provably read-only. */
export const MUTATING_OPERATIONS = ["seed", "reconcile", "remove"] as const satisfies
  readonly SeedOperationKind[];

export function isMutatingOperation(kind: SeedOperationKind): boolean {
  return (MUTATING_OPERATIONS as readonly string[]).includes(kind);
}

export type SeedDatabaseKind =
  | "shared-prisma"
  | "testora-drizzle"
  | "appbuilder-drizzle";

export type SeedAvailability = "configured" | "not-configured";

/**
 * The health of a provider's *connection*, distinct from the health of its
 * data. A provider can be `configured` yet `unreachable`.
 */
export type SeedConnectionState = "ok" | "unreachable" | "unconfigured";

/**
 * Overall data health, as rendered on the Seed Data page. Deliberately
 * distinguishes "we could not look" from "we looked and it was fine".
 */
export type SeedHealth =
  | "clean"
  | "missing"
  | "drifted"
  | "orphaned"
  | "not-configured"
  | "unavailable"
  | "validation-failed"
  | "unknown";

// ─── Ownership manifest ──────────────────────────────────────────────────
//
// The manifest is what makes removal safe. A provider may only delete a row
// it can point at through one of these entries; there is no "delete from
// table X" path anywhere in this package.

export type SeedOwnership =
  /** Created by the seed and owned by it outright — removable. */
  | "seed-owned"
  /**
   * Created by the seed but shared with the rest of the platform (e.g. a
   * demo User row). Removable only when nothing else references it.
   */
  | "seed-owned-shared"
  /** Referenced by the seed but never created or removed by it. */
  | "external";

export interface SeedManifestEntry {
  /** Stable, human-meaningful key. Unique within a provider. */
  seedKey: string;
  /** Logical entity name, as shown in the UI. Never a raw table name. */
  entity: string;
  /**
   * How a row is recognised as belonging to this entry. `id` means the seed
   * pins a literal primary key; `unique-key` means a deterministic natural
   * key; `provenance-column` means the table carries an explicit flag.
   */
  identity: "id" | "unique-key" | "provenance-column";
  ownership: SeedOwnership;
  /** seedKeys of entries that must exist first / be deleted after. */
  dependsOn?: string[];
  reconcilable: boolean;
  removable: boolean;
  /** Fields the seed writes on create but never overwrites on reconcile. */
  protectedFields?: string[];
  /** Fields owned by the user that must survive reconciliation. */
  userControlledFields?: string[];
  notes?: string;
}

// ─── Results ─────────────────────────────────────────────────────────────

export interface SeedIssue {
  code: string;
  message: string;
  severity: "error" | "warning" | "info";
  seedKey?: string;
}

export interface ValidationResult {
  ok: boolean;
  /** Version string of the seed definitions, bumped by hand when they change. */
  definitionVersion: string;
  /** Deterministic checksum over the seed definitions themselves. */
  definitionChecksum: string;
  connection: SeedConnectionState;
  issues: SeedIssue[];
  checkedAt: string;
  durationMs: number;
}

export interface SeedEntityCounts {
  entity: string;
  seedKey: string;
  present: number;
  missing: number;
  drifted: number;
  orphaned: number;
}

export interface SeedStatus {
  health: SeedHealth;
  definitionVersion: string;
  definitionChecksum: string;
  connection: SeedConnectionState;
  /** Total seed-owned rows currently in the database. */
  seedOwnedCount: number;
  missingCount: number;
  driftedCount: number;
  orphanedCount: number;
  entities: SeedEntityCounts[];
  issues: SeedIssue[];
  checkedAt: string;
  durationMs: number;
}

export interface SeedPlanChange {
  seedKey: string;
  entity: string;
  action: "insert" | "update" | "delete" | "retain";
  count: number;
  /** Why a `retain` happened — e.g. "shared user owns non-seed content". */
  reason?: string;
}

export interface SeedPlan {
  providerId: string;
  environment: SeedEnvironment;
  operation: SeedOperationKind;
  /** Opaque server-generated id; the client echoes it back on execute. */
  planId: string;
  /** Checksum over the plan's semantic content — see ./checksums.ts. */
  checksum: string;
  definitionVersion: string;
  definitionChecksum: string;
  changes: SeedPlanChange[];
  inserts: number;
  updates: number;
  deletes: number;
  retained: number;
  /** Entries the provider refuses to touch, with the reason. */
  blocked: SeedIssue[];
  warnings: SeedIssue[];
  createdAt: string;
  expiresAt: string;
}

export interface SeedResult {
  ok: boolean;
  /** True when some entities succeeded and others did not. */
  partial: boolean;
  inserted: number;
  updated: number;
  deleted: number;
  retained: number;
  perEntity: SeedPlanChange[];
  issues: SeedIssue[];
  /** Post-execution re-inspection, so the UI never has to guess. */
  verifiedStatus?: SeedStatus;
  durationMs: number;
}

// ─── Execution context ───────────────────────────────────────────────────

export interface SeedProviderContext {
  environment: SeedEnvironment;
  /** Server-resolved connection string. Never leaves the server process. */
  connectionString: string;
  /** Milliseconds after which the provider should abort. */
  timeoutMs: number;
  /** Cooperative cancellation, honoured before the first mutation only. */
  signal?: AbortSignal;
  /** Structured progress reporting; never receives raw errors. */
  report?: (event: { stage: string; message: string; percent?: number }) => void;
}

export interface SeedProvider {
  id: string;
  appId: string;
  displayName: string;
  description: string;
  databaseKind: SeedDatabaseKind;
  availability: SeedAvailability;
  /** Protected providers can never be removed from, in any environment. */
  protected: boolean;
  definitionVersion: string;
  manifest: SeedManifestEntry[];
  supports: Record<SeedOperationKind, boolean>;
  /**
   * Environment variable names (not values) this provider reads per
   * environment. Surfaced in docs and the "not configured" explanation.
   */
  requiredEnv: Partial<Record<SeedEnvironment, string[]>>;
  /** Optional deep link shown under the provider card. */
  externalLink?: { label: string; href: string; note: string };

  validate(context: SeedProviderContext): Promise<ValidationResult>;
  inspect(context: SeedProviderContext): Promise<SeedStatus>;
  plan(context: SeedProviderContext, operation: SeedOperationKind): Promise<SeedPlan>;
  execute(context: SeedProviderContext, approvedPlan: SeedPlan): Promise<SeedResult>;
}
