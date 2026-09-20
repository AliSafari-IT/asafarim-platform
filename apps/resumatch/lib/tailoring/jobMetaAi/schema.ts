import { z } from "zod";

/**
 * What a job-meta provider call may return. `.strict()` rejects any
 * unlisted field outright — the same first-lock discipline every other AI
 * output schema in this app applies.
 */
export const jobMetaOutputSchema = z
  .object({
    title: z.string().trim().max(300).nullable().default(null),
    employer: z.string().trim().max(200).nullable().default(null),
  })
  .strict();

export type JobMetaOutput = z.infer<typeof jobMetaOutputSchema>;

export function parseJobMetaOutput(input: unknown): JobMetaOutput {
  return jobMetaOutputSchema.parse(input);
}
