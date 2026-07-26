import { describe, expect, it } from "vitest";
import { GATE_DEFINITIONS, GATE_SET_VERSION, getGateDefinition } from "./registry";

describe("gate catalog", () => {
  it("defines exactly the 16 mandatory validation gates required by the M10 issue", () => {
    expect(GATE_DEFINITIONS).toHaveLength(16);
  });

  it("has a unique key for every gate", () => {
    const keys = GATE_DEFINITIONS.map((g) => g.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has a non-empty version for every gate", () => {
    for (const gate of GATE_DEFINITIONS) {
      expect(gate.version.length).toBeGreaterThan(0);
    }
  });

  it("marks every gate mandatory by default (a per-run override is a GateResult concern, not a catalog concern)", () => {
    for (const gate of GATE_DEFINITIONS) {
      expect(gate.mandatory).toBe(true);
    }
  });

  it("has a non-empty title and description for every gate (surfaced directly in the builder UI)", () => {
    for (const gate of GATE_DEFINITIONS) {
      expect(gate.title.length).toBeGreaterThan(0);
      expect(gate.description.length).toBeGreaterThan(0);
    }
  });

  it("exposes a stable, non-empty GATE_SET_VERSION", () => {
    expect(GATE_SET_VERSION.length).toBeGreaterThan(0);
  });

  it("getGateDefinition finds a known gate by key and returns undefined for an unknown one", () => {
    expect(getGateDefinition("spec_schema_validity")).toBeDefined();
    expect(getGateDefinition("does_not_exist")).toBeUndefined();
  });
});
