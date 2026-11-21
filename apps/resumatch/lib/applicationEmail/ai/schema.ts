import { z } from "zod";

/**
 * What a model may return for an application email: prose only, in four
 * bounded fields. The candidate's name, the attachments and every address
 * are added or chosen in code, never by the model (generate.ts).
 */

const trimmed = (max: number) => z.string().trim().min(1).max(max);

export const applicationEmailSuggestionSchema = z.object({
  subject: trimmed(160),
  greeting: trimmed(120),
  /** 1-3 short paragraphs. */
  paragraphs: z.array(trimmed(900)).min(1).max(3),
  signOff: trimmed(120),
});

export type ApplicationEmailSuggestion = z.infer<typeof applicationEmailSuggestionSchema>;

export function parseApplicationEmailSuggestion(input: unknown): ApplicationEmailSuggestion {
  return applicationEmailSuggestionSchema.parse(input);
}
