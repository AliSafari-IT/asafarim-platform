import { AiGenerationResultSchema, type AiGenerationResult, type AiProposalKind } from "./schemas";

/**
 * Provider-neutral generation request. `sourceContent` is untrusted — never
 * interpreted as instructions by anything outside the provider's own
 * prompt construction, and never persisted verbatim (see lib/ai/redact.ts).
 */
export interface AiGenerationRequest {
  kind: AiProposalKind;
  timelineId: string;
  /** Untrusted free text (pasted source, existing event copy, etc.) fenced by the provider before use. */
  sourceContent: string;
}

export interface AiProvider {
  readonly name: string;
  generate(request: AiGenerationRequest): Promise<AiGenerationResult>;
}

export class AiProviderError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "AiProviderError";
  }
}

/**
 * Validates raw provider output against the schema for its declared kind
 * before anything downstream can see it. A provider that returns
 * unparseable or unsafe-shaped output is a provider_failure, not a
 * partially-trusted proposal.
 */
export function parseGenerationResult(raw: unknown): AiGenerationResult {
  const result = AiGenerationResultSchema.safeParse(raw);
  if (!result.success) {
    throw new AiProviderError(`Provider output failed schema validation: ${result.error.message}`);
  }
  return result.data;
}

/**
 * Selects the configured provider. Fails closed: an unset or unrecognized
 * `TIMELINEAI_AI_PROVIDER` throws rather than silently falling back to a
 * default that might make real (billable) calls.
 */
export async function getConfiguredProvider(): Promise<AiProvider> {
  const providerName = process.env.TIMELINEAI_AI_PROVIDER;
  switch (providerName) {
    case "fixture": {
      const { fixtureProvider } = await import("./providers/fixture");
      return fixtureProvider;
    }
    default:
      throw new AiProviderError(
        `AI provider is not configured (TIMELINEAI_AI_PROVIDER=${providerName ?? "unset"}).`
      );
  }
}
