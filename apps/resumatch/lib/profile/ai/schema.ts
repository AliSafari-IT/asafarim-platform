import { z } from "zod";

/**
 * What a rewrite provider call may return: one string, nothing else.
 * `.trim().min(1)` rejects an empty rewrite as a failed call rather than
 * something that could silently blank out the candidate's summary; the
 * `.max(4000)` mirrors `candidateProfileSchema.summary`'s own cap so a
 * rewrite that would fail the profile schema on save fails visibly here
 * first instead.
 */
export const rewriteOutputSchema = z.string().trim().min(1).max(4000);

export function parseRewriteOutput(input: unknown): string {
  return rewriteOutputSchema.parse(input);
}
