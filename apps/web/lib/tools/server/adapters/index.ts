import "server-only";
import type { ToolSlug } from "../../types";
import type { ToolAdapter } from "../adapter";
import { notesToActionPlanAdapter } from "./notes-to-action-plan";
import { requirementsToTestPlanAdapter } from "./requirements-to-test-plan";
import { shellReferenceAdapter } from "./shell-reference";

/**
 * Closed map from slug to server adapter. Exhaustive over `ToolSlug`, so a
 * new tool fails typecheck until its adapter is registered.
 */
export const toolAdapters: Record<ToolSlug, ToolAdapter<unknown, unknown>> = {
  "shell-reference": shellReferenceAdapter,
  "requirements-to-test-plan": requirementsToTestPlanAdapter,
  "notes-to-action-plan": notesToActionPlanAdapter,
};
