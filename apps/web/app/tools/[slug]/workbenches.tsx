import type { ComponentType } from "react";
import { ActionPlanWorkbench } from "../../../lib/tools/action-plan/ActionPlanWorkbench";
import { ShellReferenceWorkbench } from "../../../lib/tools/reference/ShellReferenceWorkbench";
import { TimelineWorkbench } from "../../../lib/tools/timeline/TimelineWorkbench";
import { TestPlanWorkbench } from "../../../lib/tools/test-plan/TestPlanWorkbench";
import type { ToolDefinition, ToolSlug } from "../../../lib/tools/types";

/**
 * Closed map from slug to workbench. Exhaustive over `ToolSlug`, so a new
 * slug fails typecheck until its workbench is registered here, and a URL can
 * only ever select one of these components — never an arbitrary one.
 */
export const toolWorkbenches: Record<ToolSlug, ComponentType<{ tool: ToolDefinition }>> = {
  "shell-reference": ShellReferenceWorkbench,
  "requirements-to-test-plan": TestPlanWorkbench,
  "notes-to-action-plan": ActionPlanWorkbench,
  "text-to-cited-timeline": TimelineWorkbench,
};
