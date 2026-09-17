import type { EvaluateProviderCall, EvaluateProviderOutput, EvaluationProvider } from "../evaluateProvider";

/**
 * Real OpenAI evaluation adapter — intentionally unimplemented (JM-043).
 *
 * Mirrors lib/matching/ai/providers/openai.ts's embedding-side stub exactly:
 * out of scope for this issue, reachable only behind
 * `JOBMATCH_AI_EVAL_PROVIDER=openai`, itself gated by the JM-005 sign-off
 * flag in lib/env.ts in any deployed environment. Never imported by CI or
 * the fixture-only test suite (registry.ts only imports this module when
 * `openai` is actually selected).
 */
export class OpenAiEvaluationProvider implements EvaluationProvider {
  readonly name = "openai";

  async generate(_call: EvaluateProviderCall): Promise<EvaluateProviderOutput> {
    throw new Error(
      "OpenAI evaluation is not implemented yet. Set JOBMATCH_AI_EVAL_PROVIDER=fixture, " +
        "or implement this adapter before selecting JOBMATCH_AI_EVAL_PROVIDER=openai.",
    );
  }
}
