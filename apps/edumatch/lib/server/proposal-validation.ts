import { z } from "zod";
import { CANCELLATION_POLICIES } from "./lesson-proposals";

/**
 * What a tutor may change on a prepared proposal. Notably absent: anything
 * about the student. A tutor adjusts their own offer, never the brief.
 */
export const proposalAdjustmentSchema = z.object({
  sessionCount: z.number().int().min(1).max(50).optional(),
  sessionMinutes: z.number().int().min(30).max(240).optional(),
  hourlyRateCents: z.number().int().min(0).max(100_000_00).optional(),
  mode: z.enum(["ONLINE", "IN_PERSON"]).optional(),
  language: z.string().trim().min(2).max(10).optional(),
  earliestStartAt: z.coerce.date().optional(),
  planOutline: z
    .array(
      z.object({
        session: z.number().int().min(1).max(50),
        focus: z.string().trim().min(1).max(300),
        outcome: z.string().trim().min(1).max(300),
      }),
    )
    .max(50)
    .optional(),
  preparationNotes: z.string().trim().max(4000).optional(),
  cancellationPolicy: z.enum(CANCELLATION_POLICIES).optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type ProposalAdjustmentInput = z.infer<typeof proposalAdjustmentSchema>;

export const proposalDeclineSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});
