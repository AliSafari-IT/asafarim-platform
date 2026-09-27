import "server-only";
import type { ToolSlug } from "../../types";
import type { ToolAdapter } from "../adapter";
import { shellReferenceAdapter } from "./shell-reference";

/**
 * Closed map from slug to server adapter. Exhaustive over `ToolSlug`, so a
 * new tool fails typecheck until its adapter is registered.
 */
export const toolAdapters: Record<ToolSlug, ToolAdapter<unknown, unknown>> = {
  "shell-reference": shellReferenceAdapter,
};
