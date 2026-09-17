import type { EvaluateProviderCall, EvaluateProviderOutput, EvaluationProvider } from "../evaluateProvider";

/**
 * Real Anthropic evaluation adapter — intentionally unimplemented (JM-043).
 *
 * Same posture as ./evalOpenai.ts and lib/matching/ai/providers/
 * anthropic.ts's embedding-side stub: out of scope for this issue,
 * reachable only behind `JOBMATCH_AI_EVAL_PROVIDER=anthropic`, itself gated
 * by JM-005 sign-off in lib/env.ts. Never imported by CI or the
 * fixture-only test suite.
 */
export class AnthropicEvaluationProvider implements EvaluationProvider {
  readonly name = "anthropic";

  async generate(_call: EvaluateProviderCall): Promise<EvaluateProviderOutput> {
    throw new Error(
      "Anthropic evaluation is not implemented yet. Set JOBMATCH_AI_EVAL_PROVIDER=fixture, " +
        "or implement this adapter before selecting JOBMATCH_AI_EVAL_PROVIDER=anthropic.",
    );
  }
}
