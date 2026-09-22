import { describe, expect, it } from "vitest";
// Import the registry module directly rather than through the package's
// index, which re-exports next-auth-backed modules that vitest's node
// environment can't resolve (this module itself has no such dependency).
import { PLATFORM_APPS } from "@asafarim/auth/apps";
import type { SettingScope } from "./settings";

/**
 * `SettingScope` is a hand-maintained literal union rather than one derived
 * from PLATFORM_APPS (whose `key` is typed as `string`, not a literal). This
 * guards against it silently drifting out of sync when a new app is
 * registered: add the app to PLATFORM_APPS without adding it here, and this
 * test fails instead of the settings UI quietly refusing to scope to it.
 */
const SETTING_SCOPE_VALUES: readonly SettingScope[] = [
  "platform",
  "web",
  "hub",
  "showcase",
  "admin",
  "vionto",
  "testora",
  "appbuilder",
  "devtools",
  "edumatch",
  "timelineai",
  "labs",
  "resumatch",
  "tasksai",
];

describe("SettingScope", () => {
  it("covers every active PLATFORM_APPS key", () => {
    const activeAppKeys = PLATFORM_APPS.filter((app) => app.status === "active").map(
      (app) => app.key
    );

    const missing = activeAppKeys.filter(
      (key) => !SETTING_SCOPE_VALUES.includes(key as SettingScope)
    );

    expect(missing).toEqual([]);
  });

  it("does not include coming-soon app keys", () => {
    const comingSoonAppKeys = PLATFORM_APPS.filter((app) => app.status === "coming-soon").map(
      (app) => app.key
    );

    const wronglyIncluded = comingSoonAppKeys.filter((key) =>
      SETTING_SCOPE_VALUES.includes(key as SettingScope)
    );

    expect(wronglyIncluded).toEqual([]);
  });
});
