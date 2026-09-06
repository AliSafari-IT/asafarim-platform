import { z } from "zod";

/**
 * The trigger–condition–action rule model (docs: M09). Pure evaluation
 * helpers live here so a dry run is unit-testable without a database or the
 * worker.
 */
export const conditionSchema = z.object({
  field: z.string().min(1).max(60),
  op: z.enum(["eq", "neq", "contains", "gt", "lt", "is_set", "is_unset", "changed_to", "changed_from"]),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
});
export type Condition = z.infer<typeof conditionSchema>;

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("set_status"), statusId: z.string() }),
  z.object({ type: z.literal("assign"), membershipId: z.string() }),
  z.object({ type: z.literal("add_label"), labelId: z.string() }),
  z.object({ type: z.literal("comment"), body: z.string().max(4000) }),
  z.object({ type: z.literal("set_due_in_days"), days: z.number().int().min(0).max(365) }),
  z.object({ type: z.literal("webhook"), endpointId: z.string() }),
]);
export type Action = z.infer<typeof actionSchema>;

export const triggerSchema = z.object({
  event: z.string().min(1).max(60),
  filters: z.array(conditionSchema).max(10).default([]),
});

export const ruleSchema = z.object({
  name: z.string().min(1).max(120),
  trigger: triggerSchema,
  conditions: z.array(conditionSchema).max(20).default([]),
  actions: z.array(actionSchema).min(1).max(10),
  maxRunsPerHour: z.number().int().min(1).max(1000).default(60),
});
export type RuleInput = z.infer<typeof ruleSchema>;

export interface TriggerEvent {
  name: string;
  workspaceId: string;
  /** flattened fields of the target, plus `changed` map for *_changed events */
  data: Record<string, unknown>;
  changed?: Record<string, { from: unknown; to: unknown }>;
  /** the run that caused this event, if any (loop guard) */
  causationId?: string;
}

export function matchesTrigger(rule: { trigger: unknown }, event: TriggerEvent): boolean {
  const t = triggerSchema.safeParse(rule.trigger);
  if (!t.success) return false;
  if (t.data.event !== event.name) return false;
  return t.data.filters.every((c) => evalCondition(c, event));
}

export function matchesConditions(conditions: Condition[], event: TriggerEvent): boolean {
  return conditions.every((c) => evalCondition(c, event));
}

export function evalCondition(c: Condition, event: TriggerEvent): boolean {
  if (c.op === "changed_to" || c.op === "changed_from") {
    const ch = event.changed?.[c.field];
    if (!ch) return false;
    return c.op === "changed_to" ? ch.to === c.value : ch.from === c.value;
  }
  const v = event.data[c.field];
  switch (c.op) {
    case "eq":
      return v === c.value;
    case "neq":
      return v !== c.value;
    case "contains":
      return typeof v === "string" && typeof c.value === "string" && v.includes(c.value);
    case "gt":
      return typeof v === "number" && typeof c.value === "number" && v > c.value;
    case "lt":
      return typeof v === "number" && typeof c.value === "number" && v < c.value;
    case "is_set":
      return v != null && v !== "";
    case "is_unset":
      return v == null || v === "";
    default:
      return false;
  }
}

/**
 * Dry run: evaluate a rule against a sample event and describe what WOULD
 * happen, without executing any action.
 */
export function dryRun(rule: RuleInput, event: TriggerEvent) {
  const triggered = rule.trigger.event === event.name && rule.trigger.filters.every((c) => evalCondition(c, event));
  const conditionsMet = triggered && matchesConditions(rule.conditions, event);
  return {
    triggered,
    conditionsMet,
    wouldRun: conditionsMet,
    plannedActions: conditionsMet ? rule.actions : [],
    // loop guard: a rule whose action would emit the same event it triggers on
    loopRisk: rule.actions.some((a) => actionEmits(a) === event.name),
  };
}

function actionEmits(a: Action): string | null {
  switch (a.type) {
    case "set_status":
      return "task.status_changed";
    case "assign":
      return "task.assigned";
    case "add_label":
      return "task.updated";
    case "set_due_in_days":
      return "task.updated";
    case "comment":
      return "comment.created";
    default:
      return null;
  }
}
