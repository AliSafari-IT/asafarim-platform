import { z } from "zod";

const Identifier = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);

const ToolExecutedCheck = z
  .object({
    kind: z.literal("tool.executed"),
    tool: Identifier,
    minimum: z.number().int().min(1).max(100).default(1),
  })
  .strict();

const ToolNotExecutedCheck = z
  .object({
    kind: z.literal("tool.not_executed"),
    tool: Identifier,
  })
  .strict();

const ApprovalBeforeExecutionCheck = z
  .object({
    kind: z.literal("approval.before_execution"),
    tool: Identifier,
  })
  .strict();

const OutputIncludesCheck = z
  .object({
    kind: z.literal("output.includes"),
    value: z.string().min(1).max(500),
    caseSensitive: z.boolean().default(false),
  })
  .strict();

const MaximumDurationCheck = z
  .object({
    kind: z.literal("budget.max_duration_ms"),
    maximum: z.number().int().positive().max(86_400_000),
  })
  .strict();

const MaximumCostCheck = z
  .object({
    kind: z.literal("budget.max_cost_micros"),
    maximum: z.string().regex(/^\d+$/),
    currency: z.literal("USD"),
  })
  .strict();

export const AssuranceCheck = z.discriminatedUnion("kind", [
  ToolExecutedCheck,
  ToolNotExecutedCheck,
  ApprovalBeforeExecutionCheck,
  OutputIncludesCheck,
  MaximumDurationCheck,
  MaximumCostCheck,
]);

export type AssuranceCheck = z.infer<typeof AssuranceCheck>;

export const AssuranceScenario = z
  .object({
    id: Identifier,
    title: z.string().min(1).max(200),
    purpose: z.string().min(1).max(2_000),
    input: z.string().min(1).max(20_000),
    tags: z.array(Identifier).max(20).default([]),
    checks: z.array(AssuranceCheck).min(1).max(100),
  })
  .strict();

export type AssuranceScenario = z.infer<typeof AssuranceScenario>;

export const AgentOperationalContract = z
  .object({
    v: z.literal(1),
    contractId: Identifier,
    name: z.string().min(1).max(200),
    description: z.string().min(1).max(4_000),
    revision: z.number().int().positive(),
    createdAt: z.string().datetime({ offset: true }),
    scenarios: z.array(AssuranceScenario).min(1).max(500),
  })
  .strict()
  .superRefine((contract, ctx) => {
    const seen = new Set<string>();
    contract.scenarios.forEach((scenario, index) => {
      if (seen.has(scenario.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate scenario id: ${scenario.id}`,
          path: ["scenarios", index, "id"],
        });
      }
      seen.add(scenario.id);
    });
  });

export type AgentOperationalContract = z.infer<typeof AgentOperationalContract>;

export function parseAgentOperationalContract(
  value: unknown
): AgentOperationalContract {
  return AgentOperationalContract.parse(value);
}
