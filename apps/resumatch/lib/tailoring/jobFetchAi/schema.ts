import { z } from "zod";

/**
 * What a real job-fetch provider call may return. `.strict()` rejects any
 * unlisted field outright — the model has no path to add anything beyond
 * these three, the same first-lock discipline
 * lib/extraction/ai/schema.ts's `aiExtractionSchema` applies.
 */
export const jobFetchOutputSchema = z
  .object({
    title: z.string().trim().max(300).nullable().default(null),
    employer: z.string().trim().max(200).nullable().default(null),
    rawText: z.string().trim().min(1).max(200_000),
  })
  .strict();

export type JobFetchOutput = z.infer<typeof jobFetchOutputSchema>;

export function parseJobFetchOutput(input: unknown): JobFetchOutput {
  return jobFetchOutputSchema.parse(input);
}
