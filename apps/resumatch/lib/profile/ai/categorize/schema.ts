import { z } from "zod";
import type { SuggestedSkillCategory } from "./provider";

/**
 * What a categorize-skills provider call may return: a name/category pair
 * per skill. `.max(200)` mirrors prompts.ts's MAX_SKILLS_PER_CALL so an
 * over-generous provider response cannot itself become the fabrication
 * vector `mergeSuggestedCategories` otherwise guards against.
 */
const suggestedCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(60),
});

export const categorizeOutputSchema = z.object({
  categories: z.array(suggestedCategorySchema).max(200),
});

export type CategorizeSuggestions = z.infer<typeof categorizeOutputSchema>;

export function parseCategorizeOutput(input: unknown): SuggestedSkillCategory[] {
  return categorizeOutputSchema.parse(input).categories;
}

/**
 * The structural no-fabrication lock for this feature — the same role
 * `mergeTailoringSuggestions` plays for CV tailoring. A provider is never
 * trusted to only label skills it was actually given: this function is the
 * only place a suggested category is allowed to reach a real skill, and
 * only when its `name` matches one of the candidate's own skills exactly
 * (case-sensitive — the same identity the profile editor's own manual
 * override already uses). Anything else — a renamed, merged, invented, or
 * case-mismatched name — is silently dropped, never applied.
 *
 * Returns a `Map<name, category>` rather than mutating the candidate's own
 * skill list directly, so the caller decides what "accept" means (all at
 * once, or per skill — see app/profile/ProfileWorkbench.tsx).
 */
export function mergeSuggestedCategories(
  ownSkillNames: string[],
  suggestions: SuggestedSkillCategory[],
): Map<string, string> {
  const ownNames = new Set(ownSkillNames);
  const result = new Map<string, string>();
  for (const { name, category } of suggestions) {
    if (!ownNames.has(name)) continue;
    if (result.has(name)) continue; // first suggestion for a name wins
    result.set(name, category);
  }
  return result;
}
