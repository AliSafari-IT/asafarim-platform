import { z } from "zod";
import { StableId, DisplayName } from "./ids";
import { WORKFLOW_STEP_KINDS, LIMITS } from "./constants";
import { ComponentConfigValue } from "./ui";

const WorkflowTriggerKind = z.enum(["onCreate", "onUpdate", "onArchive", "manual"] as const);

export const WorkflowTrigger = z.object({
  kind: WorkflowTriggerKind,
  entityId: StableId.optional(),
});
export type WorkflowTriggerType = z.infer<typeof WorkflowTrigger>;

/**
 * A single bounded step primitive — never a script body. `condition` steps
 * are the only branching primitive, pointing at other step ids within the
 * same workflow via `config.onTrueStepId` / `config.onFalseStepId`;
 * validation.ts rejects dangling or cyclic references (see
 * "circular or unsafe workflow references" in the M04 issue).
 */
export const WorkflowStep = z.object({
  id: StableId,
  kind: z.enum(WORKFLOW_STEP_KINDS),
  config: ComponentConfigValue.default({}),
});
export type WorkflowStepType = z.infer<typeof WorkflowStep>;

export const Workflow = z.object({
  id: StableId,
  name: DisplayName,
  trigger: WorkflowTrigger,
  steps: z.array(WorkflowStep).max(LIMITS.MAX_WORKFLOW_STEPS),
  archived: z.boolean().default(false),
});
export type WorkflowType = z.infer<typeof Workflow>;
