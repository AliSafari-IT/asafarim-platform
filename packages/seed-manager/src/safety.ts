// The gate every mutating request passes through.
//
// These checks are duplicated deliberately: the Admin server action calls
// them before enqueueing, and the worker calls them again before executing.
// Disabled buttons are not authorization, and neither is a queued job.

import type {
  SeedEnvironment,
  SeedOperationKind,
  SeedPlan,
  SeedProvider,
} from "./contracts";
import { isMutatingOperation } from "./contracts";
import { isPlanExpired } from "./checksums";
import { isProductionSeedingEnabled } from "./environments";

export interface SeedActor {
  userId: string;
  roles: string[];
  permissions: string[];
  /** Epoch ms the current session was issued. Used for the freshness check. */
  sessionIssuedAtMs: number;
}

export const SEED_PERMISSIONS = {
  view: "seeds.view",
  execute: "seeds.execute",
  remove: "seeds.remove",
  schedule: "seeds.schedule",
} as const;

/** Production mutations require a session no older than this. */
export const FRESH_SESSION_MAX_AGE_MS = 15 * 60 * 1000;

export type Denial = { allowed: false; code: string; reason: string };
export type Allowance = { allowed: true };
export type Decision = Allowance | Denial;

const ALLOW: Allowance = { allowed: true };

function deny(code: string, reason: string): Denial {
  return { allowed: false, code, reason };
}

function isSuperadmin(actor: SeedActor): boolean {
  return actor.roles.includes("superadmin");
}

/**
 * Superadmin bypasses ordinary permission grants, matching the platform's
 * existing auth behaviour — but never bypasses the structural rules below
 * (protected providers, unsupported operations, production enablement).
 */
function hasPermission(actor: SeedActor, permission: string): boolean {
  return isSuperadmin(actor) || actor.permissions.includes(permission);
}

export function permissionForOperation(kind: SeedOperationKind): string {
  if (kind === "remove") return SEED_PERMISSIONS.remove;
  if (isMutatingOperation(kind)) return SEED_PERMISSIONS.execute;
  return SEED_PERMISSIONS.view;
}

export interface AuthorizeInput {
  actor: SeedActor;
  provider: SeedProvider;
  environment: SeedEnvironment;
  operation: SeedOperationKind;
  /** True for the "all providers" controls, which tighten the rules. */
  bulk?: boolean;
  now?: number;
  env?: NodeJS.ProcessEnv;
}

/**
 * The single authorization decision for one provider/environment/operation.
 * Ordered cheapest-and-most-structural first so the reason surfaced to the
 * user is the most useful one.
 */
export function authorizeOperation(input: AuthorizeInput): Decision {
  const { actor, provider, environment, operation } = input;
  const now = input.now ?? Date.now();
  const env = input.env ?? process.env;

  if (!hasPermission(actor, SEED_PERMISSIONS.view)) {
    return deny("MISSING_VIEW", "Missing permission: seeds.view.");
  }

  if (provider.availability !== "configured") {
    return deny(
      "NOT_CONFIGURED",
      `${provider.displayName} has no seed provider configured.`
    );
  }

  if (!provider.supports[operation]) {
    return deny(
      "UNSUPPORTED",
      `${provider.displayName} does not support "${operation}".`
    );
  }

  // Protection is structural: no permission, role or configuration flag
  // makes the foundation removable.
  if (operation === "remove" && provider.protected) {
    return deny(
      "PROTECTED",
      `${provider.displayName} is a protected foundation provider and can never be removed.`
    );
  }

  const permission = permissionForOperation(operation);
  if (!hasPermission(actor, permission)) {
    return deny("MISSING_PERMISSION", `Missing permission: ${permission}.`);
  }

  if (!isMutatingOperation(operation)) return ALLOW;

  if (input.bulk && operation === "remove" && !isSuperadmin(actor)) {
    return deny(
      "BULK_REQUIRES_SUPERADMIN",
      "Bulk removal requires the superadmin role."
    );
  }

  if (environment === "production") {
    if (!isProductionSeedingEnabled(env)) {
      return deny(
        "PRODUCTION_DISABLED",
        "Production seed management is disabled. Set SEED_MANAGER_PRODUCTION_ENABLED=true on the server to enable it."
      );
    }
    if (!isSuperadmin(actor)) {
      return deny(
        "PRODUCTION_REQUIRES_SUPERADMIN",
        "Production seed operations require the superadmin role."
      );
    }
    if (now - actor.sessionIssuedAtMs > FRESH_SESSION_MAX_AGE_MS) {
      return deny(
        "STALE_SESSION",
        "Sign in again — production seed operations require a session issued in the last 15 minutes."
      );
    }
  }

  return ALLOW;
}

// ─── Typed confirmation ──────────────────────────────────────────────────

/**
 * The phrase the operator must type. Operation- and target-specific, so a
 * phrase copied from one confirmation cannot approve another.
 */
export function confirmationPhrase(
  operation: SeedOperationKind,
  provider: Pick<SeedProvider, "appId">,
  environment: SeedEnvironment
): string {
  return `${operation} ${provider.appId} ${environment}`.toUpperCase();
}

export function bulkConfirmationPhrase(
  operation: SeedOperationKind,
  environment: SeedEnvironment
): string {
  if (operation === "remove") {
    return `REMOVE ALL SEEDED DATA FROM ${environment.toUpperCase()}`;
  }
  return `${operation} ALL ${environment}`.toUpperCase();
}

/** Constant-ish comparison after normalising whitespace and case. */
export function confirmationMatches(typed: string, expected: string): boolean {
  return typed.trim().replace(/\s+/g, " ").toUpperCase() === expected;
}

/**
 * The sentence that must appear on every production destructive
 * confirmation. Backups are out of scope for this feature, and the UI is
 * required to say so rather than let an operator assume otherwise.
 */
export const NO_BACKUP_NOTICE =
  "No automatic backup or restore point will be created.";

// ─── Plan revalidation ───────────────────────────────────────────────────

export type PlanCheck =
  | { ok: true }
  | { ok: false; code: "EXPIRED" | "CHECKSUM_MISMATCH" | "TARGET_MISMATCH"; reason: string };

/**
 * Compare the plan the operator approved against a plan recomputed right
 * now. Any divergence — expiry, a changed target, or data that moved under
 * the operator's feet — refuses execution rather than guessing.
 */
export function verifyApprovedPlan(
  approved: SeedPlan,
  recomputed: SeedPlan,
  now = Date.now()
): PlanCheck {
  if (isPlanExpired(approved, now)) {
    return {
      ok: false,
      code: "EXPIRED",
      reason: "This plan has expired. Run the dry run again.",
    };
  }
  if (
    approved.providerId !== recomputed.providerId ||
    approved.environment !== recomputed.environment ||
    approved.operation !== recomputed.operation
  ) {
    return {
      ok: false,
      code: "TARGET_MISMATCH",
      reason: "The approved plan does not match the requested target.",
    };
  }
  if (approved.checksum !== recomputed.checksum) {
    return {
      ok: false,
      code: "CHECKSUM_MISMATCH",
      reason:
        "The database changed since the dry run, so the approved plan no longer applies. Run the dry run again.",
    };
  }
  return { ok: true };
}
