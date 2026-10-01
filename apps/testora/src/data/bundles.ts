import type {
  FunctionalRequirementDefinition,
  TestSuiteDefinition,
  TestFixtureDefinition,
  TestCaseDefinition,
} from "@/test-engine/types";
import { edumatchFR, edumatchSuites, edumatchFixtures, edumatchCases } from "@/data/asafarim/edumatch";
import { viontoFR, viontoSuites, viontoFixtures, viontoCases } from "@/data/asafarim/vionto";
import { timelineaiFR, timelineaiSuites, timelineaiFixtures, timelineaiCases } from "@/data/asafarim/timelineai";

/**
 * Every code-defined test catalog bundle. Dependency-free (no DB), so the
 * seeder (db/seedDatabase.ts) and the seed lint (lib/seed-lint.test.ts) read
 * the same list.
 */
export interface SeedBundle {
  fr: FunctionalRequirementDefinition;
  suites: TestSuiteDefinition[];
  fixtures: TestFixtureDefinition[];
  cases: TestCaseDefinition[];
  /** App this bundle belongs to; defaults to DEFAULT_PROJECT_ID. */
  projectId?: string;
}

export const SEED_BUNDLES: SeedBundle[] = [
  // ── ASafariM apps (projectId: "asafarim-*") ────────────────────────────────
  {
    fr: timelineaiFR,
    suites: timelineaiSuites,
    fixtures: timelineaiFixtures,
    cases: timelineaiCases,
    projectId: "asafarim-timelineai",
  },
  {
    fr: edumatchFR,
    suites: edumatchSuites,
    fixtures: edumatchFixtures,
    cases: edumatchCases,
    projectId: "asafarim-edumatch",
  },
  {
    fr: viontoFR,
    suites: viontoSuites,
    fixtures: viontoFixtures,
    cases: viontoCases,
    projectId: "asafarim-vionto",
  },
];
