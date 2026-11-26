import { keywordFitOutput } from "../../keyword";
import type { FitProvider, FitProviderCall, FitProviderOutput } from "../provider";

/**
 * Deterministic, offline provider: zero cost, no network. Returns the
 * keyword check in the model's shape, so tests and local runs exercise the
 * whole AI path (validation, persistence, overlay, rubric) without a
 * real model. It is not semantic: see keyword.ts.
 */
export class FitFixtureProvider implements FitProvider {
  readonly name = "fixture";

  async analyze(call: FitProviderCall): Promise<FitProviderOutput> {
    const output = keywordFitOutput(call.inputs.selection, call.inputs.sources);
    return { output, inputTokens: Math.ceil(call.user.length / 4), outputTokens: 0, costUsd: 0 };
  }
}
