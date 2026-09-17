import type { JobMatchAiProvider } from "../../env";
import type { MatchResult } from "../contract";

/**
 * Evaluation provider interface (JM-043). Mirrors
 * apps/tasks-ai/lib/ai/provider.ts's `AiProvider`/`ProviderCall`/
 * `ProviderOutput` shape, adapted so the input boundary is explicit at the
 * type level: a call only ever carries `profileText` (always
 * `buildEmbeddingInput(profile).text` — see evaluate.ts) and `postingText`
 * (the fenced, length-capped posting description), never a raw profile
 * object. There is no field an implementation could reach for to get more
 * than that.
 */
export interface EvaluateProviderCall {
  /** buildEmbeddingInput(profile).text — the ONLY profile-derived text an
   *  evaluation provider may ever receive. */
  profileText: string;
  /** Normalised, length-capped posting description, already the exact text
   *  that will be fenced into the rendered prompt. */
  postingText: string;
  /** The rendered prompt (system + user), so a real provider adapter has
   *  what it needs to make the actual model call. The fixture provider
   *  ignores this and scores off profileText/postingText directly. */
  system: string;
  user: string;
  promptVersion: string;
  model: string;
  signal?: AbortSignal;
}

export interface EvaluateProviderOutput {
  result: MatchResult;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  seed?: string;
}

export interface EvaluationProvider {
  readonly name: JobMatchAiProvider;
  generate(call: EvaluateProviderCall): Promise<EvaluateProviderOutput>;
}

export class EvaluationProviderError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable = true) {
    super(message);
    this.name = "EvaluationProviderError";
    this.retryable = retryable;
  }
}
