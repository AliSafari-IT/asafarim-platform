import { ACTION_PLAN_TOOL_VERSION } from "./action-plan/schema";
import { TEST_PLAN_TOOL_VERSION } from "./test-plan/schema";
import { CITED_TIMELINE_TOOL_VERSION } from "./timeline/schema";
import type { ToolSlug } from "./types";

export const SHELL_REFERENCE_TOOL_VERSION = "1.0.0";

/**
 * Client-safe tool versions, the same values the server adapters report
 * (a test checks they match). Used for analytics and handoff files.
 */
export const TOOL_VERSIONS: Record<ToolSlug, string> = {
  "shell-reference": SHELL_REFERENCE_TOOL_VERSION,
  "requirements-to-test-plan": TEST_PLAN_TOOL_VERSION,
  "notes-to-action-plan": ACTION_PLAN_TOOL_VERSION,
  "text-to-cited-timeline": CITED_TIMELINE_TOOL_VERSION,
};
