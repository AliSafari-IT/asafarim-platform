import type { ProviderCallMeta } from "../../costs/providerMeta";
import type { ResuMatchAiProvider } from "../../env";

/**
 * Extraction provider interface. Mirrors lib/tailoring/ai/provider.ts's
 * `TailorProviderCall`/`TailorProvider` shape: the input boundary is
 * explicit at the type level so an implementation can only ever reach the
 * one fenced text block it is handed, never a raw request/session object.
 */
export interface ExtractionProviderCall {
  /** The CV's extracted, normalized text — the exact text placed inside the
   *  prompt's fenced data block. Untrusted: it is candidate-supplied
   *  document content, fenced and treated as DATA ONLY by the prompt (see
   *  prompts.ts), the same posture lib/tailoring/ai/prompts.ts takes toward
   *  job-page text. */
  text: string;
  system: string;
  user: string;
  promptVersion: string;
  model: string;
  signal?: AbortSignal;
}

export interface ExtractionProviderOutput extends ProviderCallMeta {
  /** Raw parsed JSON from the model — NOT yet schema-validated. The caller
   *  (lib/extraction/ai/degraded.ts) is the only place this is turned into
   *  trusted profile content, via schema.ts's parseAiExtractionOutput +
   *  mergeAiExtraction. A provider must never do that itself. */
  data: unknown;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface ExtractionProvider {
  readonly name: ResuMatchAiProvider;
  extract(call: ExtractionProviderCall): Promise<ExtractionProviderOutput>;
}

export class ExtractionProviderError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable = true) {
    super(message);
    this.name = "ExtractionProviderError";
    this.retryable = retryable;
  }
}
