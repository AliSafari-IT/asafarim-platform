import type { ResuMatchAiProvider } from "../../../env";

/**
 * Skill-categorization provider interface. Deliberately narrow the same way
 * lib/profile/ai/provider.ts's rewrite call is: the only input is the
 * candidate's own skill *names* — never the rest of the profile, and never
 * an employer, date, or other fact — so a provider has no material from
 * which to introduce a claim about the candidate. It is also asked for a
 * label, not a fact: "which group does this skill belong to" carries no
 * truth value the way "did this candidate work at Acme Corp" does.
 */
export interface CategorizeSkillsProviderCall {
  /** The candidate's own skill names, exactly as stored — the only thing
   *  fenced into the prompt as DATA (see prompts.ts). */
  skillNames: string[];
  system: string;
  user: string;
  promptVersion: string;
  model: string;
  signal?: AbortSignal;
}

export interface SuggestedSkillCategory {
  name: string;
  category: string;
}

export interface CategorizeSkillsProviderOutput {
  /** Schema-validated, but NOT yet the no-fabrication-checked result —
   *  see schema.ts's `mergeSuggestedCategories`, which is the only place
   *  a suggestion here is allowed to reach a skill's actual `category`
   *  field, and only for a name that exactly matches one already in the
   *  candidate's own profile. */
  suggestions: SuggestedSkillCategory[];
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface CategorizeSkillsProvider {
  readonly name: ResuMatchAiProvider;
  categorize(call: CategorizeSkillsProviderCall): Promise<CategorizeSkillsProviderOutput>;
}

export class CategorizeSkillsProviderError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable = true) {
    super(message);
    this.name = "CategorizeSkillsProviderError";
    this.retryable = retryable;
  }
}
