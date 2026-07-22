import { z } from "zod";
import { PLANNING_LIMITS, CONFIDENCE_LEVELS } from "../constants";

/**
 * The model may only ever select a template by its stable registered id
 * (@asafarim/appbuilder-runtime's template registry — "blank",
 * "task_management", "crm", "inventory", "booking" as of M06). This schema
 * intentionally has NO field for template code, markup, or a free-form
 * "custom template" escape hatch — an unknown id is a validation failure
 * handled by the pipeline, never silently substituted.
 */
export const TemplateRecommendation = z.object({
  templateId: z.string().min(1).max(64),
  /** Safe, structured reasoning summary — never chain-of-thought, never unbounded. */
  reasoningSummary: z.string().min(1).max(PLANNING_LIMITS.MAX_REASONING_SUMMARY_LENGTH),
  confidence: z.enum(CONFIDENCE_LEVELS),
});
export type TemplateRecommendationType = z.infer<typeof TemplateRecommendation>;

/**
 * Records the full picture for the audit trail: what the user asked for at
 * creation time (`creation_requests.starterFamily`), what the model
 * recommended, and whether they differ — the pipeline persists this
 * verbatim rather than silently overriding the user's own choice.
 */
export interface TemplateSelectionRecord {
  requestedStarterFamily: string;
  recommended: TemplateRecommendationType;
  selectedTemplateId: string;
  differsFromRequested: boolean;
}
