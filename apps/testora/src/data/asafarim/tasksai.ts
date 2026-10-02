import type {
  FunctionalRequirementDefinition,
  TestSuiteDefinition,
  TestFixtureDefinition,
  TestCaseDefinition,
} from "@/test-engine/types";
import { TASKSAI_PROJECT_ID } from "@/data/projects";

/**
 * ASafariM TasksAI end-user catalog (#742).
 *
 * Slice 1 registers the app and its requirement only: no suites, fixtures or
 * cases yet. What will exist, and on which targets it may run, is the coverage
 * manifest in ./tasksai-coverage.ts. Later slices add executable fixtures and
 * flip manifest entries from "planned" to "implemented".
 *
 * Fixtures will use relative paths so the run's target decides the origin.
 * The requirement root defaults to the Local origin, so a run with no target
 * never lands on production.
 */
export const tasksaiFR: FunctionalRequirementDefinition = {
  id: TASKSAI_PROJECT_ID,
  projectId: TASKSAI_PROJECT_ID,
  title: "TasksAI · End-user journeys",
  description:
    "End-user scenarios for TasksAI: sign-in, capture and triage, projects, task details, My Work, views, " +
    "dependencies, completion checks, search, Focus, Copilot, imports, automations, analytics and permissions. " +
    "See the coverage manifest for which scenarios are executable and on which targets.",
  baseUrl: process.env.NEXT_PUBLIC_ASAFARIM_TASKSAI_LOCAL_URL || "http://localhost:3013",
};

export const tasksaiSuites: TestSuiteDefinition[] = [];
export const tasksaiFixtures: TestFixtureDefinition[] = [];
export const tasksaiCases: TestCaseDefinition[] = [];
