import { z } from "zod";
import { ToolEvent } from "./evidence";

const Identifier = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);

/**
 * Portable JSON request sent to an HTTP assurance target. Authentication and
 * routing headers are deliberately outside this schema so they can never be
 * copied into run evidence.
 */
export const HttpAgentRunRequest = z
  .object({
    v: z.literal(1),
    runId: Identifier,
    contractId: Identifier,
    contractRevision: z.number().int().positive(),
    scenarioId: Identifier,
    input: z.string().min(1).max(20_000),
  })
  .strict();

export type HttpAgentRunRequest = z.infer<typeof HttpAgentRunRequest>;

/**
 * Normalized response returned by a target adapter. Output must already be
 * synthetic or redacted; callers must not send unrestricted production data.
 */
export const HttpAgentRunResponse = z
  .object({
    v: z.literal(1),
    status: z.enum(["completed", "failed", "cancelled"]),
    output: z.string().max(100_000).optional(),
    totalCostMicros: z.string().regex(/^\d+$/).optional(),
    toolEvents: z.array(ToolEvent).max(10_000).default([]),
  })
  .strict();

export type HttpAgentRunResponse = z.infer<typeof HttpAgentRunResponse>;

export function parseHttpAgentRunResponse(
  value: unknown
): HttpAgentRunResponse {
  return HttpAgentRunResponse.parse(value);
}
