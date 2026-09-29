import { z } from "zod";

const Identifier = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);

export const ToolEvent = z
  .object({
    sequence: z.number().int().nonnegative(),
    callId: Identifier,
    tool: Identifier,
    phase: z.enum(["proposed", "approved", "denied", "executed", "failed"]),
    occurredAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type ToolEvent = z.infer<typeof ToolEvent>;

export const AgentRunEvidence = z
  .object({
    v: z.literal(1),
    runId: Identifier,
    contractId: Identifier,
    contractRevision: z.number().int().positive(),
    scenarioId: Identifier,
    startedAt: z.string().datetime({ offset: true }),
    finishedAt: z.string().datetime({ offset: true }),
    status: z.enum(["completed", "failed", "cancelled"]),
    output: z.string().max(100_000).optional(),
    durationMs: z.number().int().nonnegative().optional(),
    totalCostMicros: z.string().regex(/^\d+$/).optional(),
    toolEvents: z.array(ToolEvent).max(10_000).default([]),
  })
  .strict()
  .superRefine((evidence, ctx) => {
    const started = Date.parse(evidence.startedAt);
    const finished = Date.parse(evidence.finishedAt);
    if (finished < started) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "finishedAt must not be before startedAt",
        path: ["finishedAt"],
      });
    }

    const seenSequences = new Set<number>();
    evidence.toolEvents.forEach((event, index) => {
      if (seenSequences.has(event.sequence)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate tool event sequence: ${event.sequence}`,
          path: ["toolEvents", index, "sequence"],
        });
      }
      seenSequences.add(event.sequence);
    });
  });

export type AgentRunEvidence = z.infer<typeof AgentRunEvidence>;

export function parseAgentRunEvidence(value: unknown): AgentRunEvidence {
  return AgentRunEvidence.parse(value);
}
