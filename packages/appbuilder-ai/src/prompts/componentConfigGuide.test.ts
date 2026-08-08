import { describe, expect, it } from "vitest";
import { ZodObject } from "zod";
import { CONFIG_TABLE } from "@asafarim/appbuilder-runtime/registry/configTable";
import { COMPONENT_CONFIG_GUIDE } from "./componentConfigGuide";

/**
 * Drift guard for COMPONENT_CONFIG_GUIDE: the guide text is hand-written
 * (an LLM prompt has to read as prose, not JSON), so nothing forces it to
 * stay in sync with packages/appbuilder-runtime's real, render-time
 * `.strict()` config schemas as those evolve. This test closes that gap by
 * introspecting the real schemas (via the registry's public
 * `listRegistryEntries()` — @asafarim/appbuilder-runtime is a devDependency
 * here, test-only, no runtime coupling) and asserting every key the guide
 * claims is valid for a given (kind, variant) is actually present on that
 * variant's real Zod schema.
 *
 * This does not prove the guide is complete (a key present on the real
 * schema but missing from the guide won't fail this test) — it proves the
 * guide never tells the model something false, which is the failure mode
 * that actually produced the "Unrecognized key(s)" bug this guide fixes.
 */
describe("COMPONENT_CONFIG_GUIDE stays truthful against the real config schemas", () => {
  const entries = CONFIG_TABLE;

  // The guide is one bullet per line within each "kind=...:" block, so a
  // single line is the right unit to scope a (kind, variant) pair's claimed
  // keys to — anything coarser (e.g. up to the next blank line) bleeds
  // adjacent variants' keys together, since those bullets aren't
  // blank-line-separated from each other.
  const lines = COMPONENT_CONFIG_GUIDE.split("\n");

  function lineFor(entry: (typeof entries)[number]): string {
    // "default"-variant kinds (statWidget/chartWidget/buttonAction) have no
    // config.variant discriminator in the real schema, so the guide
    // documents them by "kind=" alone, one bullet below it — not by a
    // variant="default" marker.
    const marker = entry.variant === "default" ? `kind="${entry.schemaKind}"` : `variant="${entry.variant}"`;
    const idx = lines.findIndex((l) => l.includes(marker));
    expect(idx, `${marker} missing from guide`).toBeGreaterThanOrEqual(0);
    // For a "kind=" heading, the config keys are on the next non-blank line.
    return entry.variant === "default" ? lines[idx + 1]! : lines[idx]!;
  }

  it("covers every registered (kind, variant) pair", () => {
    for (const entry of entries) {
      expect(lineFor(entry).length).toBeGreaterThan(0);
    }
  });

  it("never claims a key that the real schema doesn't accept", () => {
    for (const entry of entries) {
      const schema = entry.configSchema;
      if (!(schema instanceof ZodObject)) continue;
      const realKeys = new Set(Object.keys(schema.shape));
      // Only the outermost object's keys are this schema's own — a nested
      // `Array<{ ... }>` (settingsPanel's sections, activityTimeline's
      // items) describes a *different* schema's shape, not this one's.
      const line = lineFor(entry);
      const topLevel = line.split("Array<")[0]!;

      const claimedKeys = [...topLevel.matchAll(/\b([a-zA-Z][a-zA-Z0-9]*)\??:/g)]
        .map((m) => m[1]!)
        // "variant" is the discriminator (a real field, but already asserted
        // separately by name above); "config"/"kind.config" is the line's own
        // "- config: { ... }" / "- kind.config: { ... }" prefix, not a schema field.
        .filter((k) => k !== "variant" && k !== "config" && k !== "kind");

      const label = entry.variant === "default" ? `kind="${entry.schemaKind}"` : `variant="${entry.variant}"`;
      for (const key of claimedKeys) {
        expect(realKeys.has(key), `guide claims "${key}" for ${label}, but the real schema doesn't accept it`).toBe(
          true,
        );
      }
    }
  });

  it("does not claim the retired dataTable keys that caused the original bug", () => {
    for (const bogus of ["columns", "sort", "filters", "action", "targetPageId"]) {
      // Allow "targetPageId" only in the explanatory sentence about
      // NavigationItem — never inside a config key list for a component.
      if (bogus === "targetPageId") {
        expect(COMPONENT_CONFIG_GUIDE).toContain("NavigationItem");
        continue;
      }
      expect(COMPONENT_CONFIG_GUIDE.includes(`${bogus}:`) || COMPONENT_CONFIG_GUIDE.includes(`${bogus}?:`)).toBe(
        false,
      );
    }
  });
});
