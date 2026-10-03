import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseHandoff } from "@asafarim/tool-handoff";
// Testora's manifest is dependency-free data, so TasksAI can check its own
// setup against it directly (#742 architect constraint 5).
import { TASKSAI_COVERAGE } from "../../../testora/src/data/asafarim/tasksai-coverage";
import {
  EXTERNAL_PREREQUISITES,
  PREREQUISITES,
  SAMPLE_FILES,
  WORKSPACES,
  buildHandoffSamples,
  isSyntheticSlug,
  relativeDue,
} from "./plan";

describe("TasksAI test data plan (#742 slice 2b)", () => {
  it("setup provides every prerequisite the coverage manifest names for slices 3–6", () => {
    const named = new Set(TASKSAI_COVERAGE.filter((e) => e.slice >= 3).flatMap((e) => e.prerequisites));
    const unprovided = [...named].filter((p) => !(p in PREREQUISITES));
    expect(unprovided).toEqual([]);
  });

  it("only the worker is external (not in TasksAI's database), and it says why", () => {
    expect(EXTERNAL_PREREQUISITES).toEqual(["automation worker"]);
    for (const name of EXTERNAL_PREREQUISITES) expect(PREREQUISITES[name]!.how.length).toBeGreaterThan(20);
  });

  it("every synthetic workspace carries the marker", () => {
    for (const slug of Object.values(WORKSPACES)) expect(isSyntheticSlug(slug)).toBe(true);
    expect(isSyntheticSlug("acme")).toBe(false);
    expect(isSyntheticSlug("tasksai-synthetic")).toBe(false);
  });

  it("the controlled clock: due dates are the zone's calendar day at noon UTC", () => {
    // 23:30 UTC on 1 Oct is already 2 Oct in Brussels.
    const anchor = new Date("2026-10-01T23:30:00Z");
    expect(relativeDue(anchor, "Europe/Brussels", 0)).toBe("2026-10-02T12:00:00.000Z");
    expect(relativeDue(anchor, "Europe/Brussels", -3)).toBe("2026-09-29T12:00:00.000Z");
    expect(relativeDue(anchor, "UTC", 5)).toBe("2026-10-06T12:00:00.000Z");
  });

  it("the committed import samples exist", () => {
    const dir = path.resolve(__dirname, "../../scripts/test-data/samples");
    for (const file of SAMPLE_FILES) expect(existsSync(path.join(dir, file)), file).toBe(true);
  });

  it("handoff samples are real, valid TasksAI handoffs, and the duplicate is identical", () => {
    const now = new Date("2026-10-03T08:00:00Z");
    const { handoff, duplicate } = buildHandoffSamples(now);
    const parsed = parseHandoff(JSON.stringify(handoff), "tasksai", now);
    expect(parsed.ok).toBe(true);
    expect(duplicate).toEqual(handoff);
    expect(duplicate.handoffId).toBe(handoff.handoffId);
  });
});
