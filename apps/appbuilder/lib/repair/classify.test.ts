import { describe, expect, it } from "vitest";
import { classifyValidationFailure } from "./classify";
import type { ValidationGateResultRow } from "../repositories/validationRuns";

function gate(overrides: Partial<ValidationGateResultRow>): ValidationGateResultRow {
  return {
    id: "g1",
    runId: "r1",
    appId: "a1",
    gateKey: "spec_schema_validity",
    gateVersion: "1.0.0",
    mandatory: true,
    status: "failed",
    skipReason: null,
    failureCode: null,
    failureMessage: null,
    structuredFailures: [],
    evidence: {},
    artifactIds: [],
    durationMs: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    ...overrides,
  } as ValidationGateResultRow;
}

describe("classifyValidationFailure", () => {
  it("classifies an infrastructure_error gate as infrastructure_failure and never repairable", () => {
    const result = classifyValidationFailure([gate({ status: "infrastructure_error", gateKey: "accessibility_baseline" })]);
    expect(result.classification).toBe("infrastructure_failure");
    expect(result.repairable).toBe(false);
  });

  it("classifies a flaky gate as flaky_test and never repairable", () => {
    const result = classifyValidationFailure([gate({ status: "flaky", gateKey: "generated_data_crud_smoke" })]);
    expect(result.classification).toBe("flaky_test");
    expect(result.repairable).toBe(false);
  });

  it("infrastructure_error takes priority over a simultaneous failed gate — never partially repairs while infra evidence is untrustworthy", () => {
    const result = classifyValidationFailure([
      gate({ status: "infrastructure_error", gateKey: "accessibility_baseline" }),
      gate({ status: "failed", gateKey: "permissions_authorization" }),
    ]);
    expect(result.classification).toBe("infrastructure_failure");
    expect(result.repairable).toBe(false);
  });

  it("classifies a failed permissions_authorization gate (the M09-style permission-gap bug) as a security_policy_failure — still repairable, but routed through the security bucket for extra scrutiny rather than the generic configuration-error bucket", () => {
    const result = classifyValidationFailure([gate({ status: "failed", gateKey: "permissions_authorization" })]);
    expect(result.classification).toBe("security_policy_failure");
    expect(result.repairable).toBe(true);
    expect(result.targetGateKeys).toEqual(["permissions_authorization"]);
  });

  it("classifies a failed reference_integrity gate (repairable but not security-shaped) as a supported, repairable configuration error", () => {
    const result = classifyValidationFailure([gate({ status: "failed", gateKey: "reference_integrity" })]);
    expect(result.classification).toBe("supported_repairable_configuration_error");
    expect(result.repairable).toBe(true);
  });

  it("classifies a failed migration/schema-evolution gate as migration_data_safety_failure and never repairable", () => {
    const result = classifyValidationFailure([gate({ status: "failed", gateKey: "schema_evolution_safety" })]);
    expect(result.classification).toBe("migration_data_safety_failure");
    expect(result.repairable).toBe(false);
  });

  it("classifies a failed accessibility_baseline gate as accessibility_failure and never repairable (a11y fixes are a human/design decision)", () => {
    const result = classifyValidationFailure([gate({ status: "failed", gateKey: "accessibility_baseline" })]);
    expect(result.classification).toBe("accessibility_failure");
    expect(result.repairable).toBe(false);
  });

  it("classifies an unrecognized/unsupported failing gate as test_failure, not repairable", () => {
    const result = classifyValidationFailure([gate({ status: "failed", gateKey: "generated_data_crud_smoke" })]);
    expect(result.classification).toBe("test_failure");
    expect(result.repairable).toBe(false);
  });

  it("classifies a mix of repairable and non-repairable failures as unsupported_product_capability rather than partially repairing", () => {
    const result = classifyValidationFailure([
      gate({ status: "failed", gateKey: "reference_integrity" }),
      gate({ status: "failed", gateKey: "required_pages_routes" }),
    ]);
    expect(result.classification).toBe("unsupported_product_capability");
    expect(result.repairable).toBe(false);
  });
});
