import type { ResuMatchAiProvider } from "../../env";
import type { TailorSuggestions } from "./schema";

/**
 * Tailoring provider interface. Mirrors the shape of the old matching
 * product's `EvaluateProviderCall`/`EvaluationProvider`
 * (lib/matching/ai/evaluateProvider.ts, deleted with the pivot): the input
 * boundary is explicit at the type level so an implementation can only ever
 * reach the two fenced text blocks it is handed, never a raw profile or
 * request object.
 */
export interface TailorProviderCall {
  /** The candidate's confirmed profile, serialized to the exact text placed
   *  inside the prompt's profile fence. */
  profileText: string;
  /** The target job's extracted, redacted text — the exact text placed
   *  inside the prompt's job fence. */
  jobText: string;
  system: string;
  user: string;
  promptVersion: string;
  model: string;
  /** The profile's own skill names, in order — structured convenience data
   *  for a provider to align its `skillsOrder` suggestion against, not part
   *  of the fenced prompt text itself. A provider is never trusted to only
   *  suggest names from this list — `mergeTailoringSuggestions`
   *  (lib/tailoring/ai/schema.ts) re-validates that regardless. */
  profileSkillNames: string[];
  /** One entry per `profile.experience[i]`, its existing (pre-tailoring)
   *  summary text or null — structured convenience data so a provider can
   *  align `experienceBullets` by index without re-parsing `profileText`. */
  experienceSummaries: (string | null)[];
  /** The candidate's own freeform steering text for this run (issue #431),
   *  already capped/fenced into `user` — carried here separately only so a
   *  provider can log/inspect it without re-parsing `user`. A preference
   *  signal only; see prompts.ts's HARD RULES. */
  instructions?: string | null;
  signal?: AbortSignal;
}

export interface TailorProviderOutput {
  suggestions: TailorSuggestions;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  seed?: string;
}

export interface TailorProvider {
  readonly name: ResuMatchAiProvider;
  generate(call: TailorProviderCall): Promise<TailorProviderOutput>;
}

export class TailorProviderError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable = true) {
    super(message);
    this.name = "TailorProviderError";
    this.retryable = retryable;
  }
}
