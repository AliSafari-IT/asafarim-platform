import type { ValidationGateResultRow } from "../repositories/validationRuns";

export type RepairFailureClassification =
  | "user_specification_error"
  | "supported_repairable_configuration_error"
  | "unsupported_product_capability"
  | "test_failure"
  | "accessibility_failure"
  | "security_policy_failure"
  | "migration_data_safety_failure"
  | "provider_failure"
  | "infrastructure_failure"
  | "flaky_test"
  | "cancellation";

/** Gate keys the classifier considers safe to hand to `proposeRepair` at all — everything else is a real product defect a human should review by hand rather than delegate to the bounded loop, even though it might technically be a config-shaped fix. */
const REPAIRABLE_GATE_KEYS = new Set<string>([
  "permissions_authorization",
  "reference_integrity",
  "unsafe_content_policy",
]);

/** Gate keys whose failures are inherently security/permission-shaped — classified distinctly so the repair pipeline can apply extra scrutiny (still routed through the same confirmation gate as any other destructive change, never bypassed). */
const SECURITY_GATE_KEYS = new Set<string>(["permissions_authorization", "unsafe_content_policy"]);

export interface FailureClassificationResult {
  classification: RepairFailureClassification;
  /** Only classifications the pipeline will ever attempt a repair for. `infrastructure_failure`, `flaky_test`, and `cancellation` are NEVER repairable, regardless of which gate produced them — issue requirement: "do not repair infrastructure failures or flaky tests by changing the generated app." */
  repairable: boolean;
  targetGateKeys: string[];
}

/**
 * Classifies a validation run's failed/infrastructure/flaky gates into the
 * closed vocabulary the issue requires. Runs BEFORE ever calling
 * `proposeRepair` — the model's own `repairable` self-assessment
 * (schemas/repairProposal.ts) is cross-checked against this, never trusted
 * alone (see lib/repair/pipeline.ts).
 */
export function classifyValidationFailure(gates: readonly ValidationGateResultRow[]): FailureClassificationResult {
  const infrastructure = gates.filter((g) => g.status === "infrastructure_error");
  if (infrastructure.length > 0) {
    return { classification: "infrastructure_failure", repairable: false, targetGateKeys: infrastructure.map((g) => g.gateKey) };
  }

  const flaky = gates.filter((g) => g.status === "flaky");
  if (flaky.length > 0) {
    return { classification: "flaky_test", repairable: false, targetGateKeys: flaky.map((g) => g.gateKey) };
  }

  const failed = gates.filter((g) => g.status === "failed");
  if (failed.length === 0) {
    // Nothing failed — nothing to classify/repair (caller should not have invoked this).
    return { classification: "test_failure", repairable: false, targetGateKeys: [] };
  }

  const targetGateKeys = failed.map((g) => g.gateKey);
  const security = failed.filter((g) => SECURITY_GATE_KEYS.has(g.gateKey));
  const migration = failed.filter((g) => g.gateKey === "schema_evolution_safety" || g.gateKey === "migration_destructive_safety");
  const accessibility = failed.filter((g) => g.gateKey === "accessibility_baseline");
  const repairableCandidates = failed.filter((g) => REPAIRABLE_GATE_KEYS.has(g.gateKey));

  if (migration.length > 0) {
    return { classification: "migration_data_safety_failure", repairable: false, targetGateKeys: migration.map((g) => g.gateKey) };
  }
  if (security.length > 0) {
    return { classification: "security_policy_failure", repairable: true, targetGateKeys: security.map((g) => g.gateKey) };
  }
  if (accessibility.length > 0) {
    return { classification: "accessibility_failure", repairable: false, targetGateKeys: accessibility.map((g) => g.gateKey) };
  }
  if (repairableCandidates.length === failed.length && repairableCandidates.length > 0) {
    return { classification: "supported_repairable_configuration_error", repairable: true, targetGateKeys: repairableCandidates.map((g) => g.gateKey) };
  }
  if (repairableCandidates.length > 0) {
    // A mix of repairable and non-repairable failures — treat the whole run
    // as an unsupported-capability case rather than partially repairing,
    // since a repair loop iteration is scoped to "this run's failure",
    // singular, not a subset of it.
    return { classification: "unsupported_product_capability", repairable: false, targetGateKeys };
  }

  return { classification: "test_failure", repairable: false, targetGateKeys };
}
