import { describe, expect, it } from "vitest";
import {
  M13_FEATURE_FLAGS,
  describeFeatureFlags,
  isAttachmentsEnabled,
  isContextualMemoryEnabled,
  isFeatureEnabled,
  isPlanningEnabled,
  isShadowEvaluationEnabled,
  isUrlImportsEnabled,
  isVisionEnabled,
  type M13FeatureFlag,
} from "./flags";

const ALL_FLAGS = Object.keys(M13_FEATURE_FLAGS) as M13FeatureFlag[];

describe("M13 slice G feature flags", () => {
  it("defaults attachments, contextual memory, and planning ON (slices B–E shipped them as core behavior)", () => {
    expect(isAttachmentsEnabled({})).toBe(true);
    expect(isContextualMemoryEnabled({})).toBe(true);
    expect(isPlanningEnabled({})).toBe(true);
  });

  it("defaults vision and URL import OFF — each needs an operator decision first", () => {
    expect(isVisionEnabled({})).toBe(false);
    expect(isUrlImportsEnabled({})).toBe(false);
  });

  it("defaults shadow evaluation OFF — it costs a second provider call per request", () => {
    expect(isShadowEvaluationEnabled({})).toBe(false);
    expect(isShadowEvaluationEnabled({ APPBUILDER_SHADOW_EVALUATION_ENABLED: "true" })).toBe(true);
  });

  it.each(ALL_FLAGS)("honors an explicit true/false for %s", (flag) => {
    const { envVar } = M13_FEATURE_FLAGS[flag];
    expect(isFeatureEnabled(flag, { [envVar]: "true" })).toBe(true);
    expect(isFeatureEnabled(flag, { [envVar]: "false" })).toBe(false);
  });

  it.each(ALL_FLAGS)(
    "falls back to the documented default for a non-boolean value of %s rather than coercing it",
    (flag) => {
      const { envVar, defaultEnabled } = M13_FEATURE_FLAGS[flag];
      // "yes"/"1"/"TRUE" silently enabling image upload to a third-party
      // provider is precisely the accident this refuses to make possible.
      for (const value of ["yes", "1", "on", "TRUE", "True", " true", ""]) {
        expect(isFeatureEnabled(flag, { [envVar]: value })).toBe(defaultEnabled);
      }
    }
  );

  it("gives every flag its own env var — no shared switch can disable two features at once", () => {
    const envVars = ALL_FLAGS.map((f) => M13_FEATURE_FLAGS[f].envVar);
    expect(new Set(envVars).size).toBe(envVars.length);
  });

  it("leaves the other four flags untouched when one is disabled", () => {
    for (const flag of ALL_FLAGS) {
      const env = { [M13_FEATURE_FLAGS[flag].envVar]: "false" };
      for (const other of ALL_FLAGS) {
        if (other === flag) continue;
        expect(isFeatureEnabled(other, env)).toBe(M13_FEATURE_FLAGS[other].defaultEnabled);
      }
    }
  });

  it("reports whether each resolved value came from the env or from the default", () => {
    const states = describeFeatureFlags({ APPBUILDER_VISION_ENABLED: "true" });
    const vision = states.find((s) => s.key === "vision")!;
    expect(vision.enabled).toBe(true);
    expect(vision.usingDefault).toBe(false);

    const attachments = states.find((s) => s.key === "attachments")!;
    expect(attachments.enabled).toBe(true);
    expect(attachments.usingDefault).toBe(true);
  });

  it("describes what stops working for every flag, so readiness never shows a nameless switch", () => {
    for (const state of describeFeatureFlags({})) {
      expect(state.disabledEffect.length).toBeGreaterThan(20);
    }
  });
});
