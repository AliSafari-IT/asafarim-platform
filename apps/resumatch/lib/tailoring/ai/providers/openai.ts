import type { TailorProvider, TailorProviderCall, TailorProviderOutput } from "../provider";

/**
 * Real OpenAI tailoring adapter — intentionally unimplemented.
 *
 * Mirrors the old matching product's provider stubs
 * (lib/matching/ai/providers/evalOpenai.ts, deleted with the pivot):
 * out of scope for this pass, reachable only behind
 * `JOBMATCH_AI_PROVIDER=openai`, itself gated by the JM-005 sign-off flag
 * in lib/env.ts in any deployed environment. Never imported by CI or the
 * fixture-only test suite (registry.ts only imports this module when
 * `openai` is actually selected).
 */
export class OpenAiTailorProvider implements TailorProvider {
  readonly name = "openai";

  async generate(_call: TailorProviderCall): Promise<TailorProviderOutput> {
    throw new Error(
      "OpenAI tailoring is not implemented yet. Set JOBMATCH_AI_PROVIDER=fixture, " +
        "or implement this adapter before selecting JOBMATCH_AI_PROVIDER=openai. ",
    );
  }
}
