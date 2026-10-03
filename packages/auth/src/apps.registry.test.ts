import { describe, expect, it } from "vitest";
import launcherRegistry from "../../../generated/platform/launcher-registry.json";
import { PLATFORM_APPS } from "./apps";
import snapshot from "./__fixtures__/platform-apps.snapshot.json";

/**
 * #769 step 1: PLATFORM_APPS is now built from the generated launcher registry
 * plus the hand-written entries. The snapshot is the hand-written list as it
 * was right before the switch, so this proves the switch changed nothing.
 * A deliberate registry change updates the snapshot in the same PR.
 */
describe("PLATFORM_APPS from the generated launcher registry", () => {
  it("equals the hand-written registry it replaced, entry for entry and in order", () => {
    expect(PLATFORM_APPS).toEqual(snapshot);
  });

  it("takes every app tile from the generated file", () => {
    const generated = launcherRegistry.apps.map((a) => a.key);
    expect(generated).toEqual([
      "web",
      "hub",
      "showcase",
      "vionto",
      "testora",
      "appbuilder",
      "edumatch",
      "timelineai",
      "labs",
      "resumatch",
      "tasksai",
    ]);
    for (const key of generated) expect(PLATFORM_APPS.some((app) => app.key === key)).toBe(true);
  });

  it("has unique keys and carries no generator-only fields", () => {
    const keys = PLATFORM_APPS.map((app) => app.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const app of PLATFORM_APPS) expect(app).not.toHaveProperty("order");
  });
});
