/*
 * Cost/latency estimation — computed BEFORE a stage runs, from the manifest
 * shape alone. Pure function of its inputs; the reference rates below are
 * fixed, labelled constants, not live provider pricing.
 *
 * The benchmark's "estimated vs. observed" dimension compares this estimate
 * against what the fixture renderer actually reports after running — see
 * scripts/generate-fixtures.mjs.
 */

/** Fixed reference rates — representative, not live provider pricing. */
export const REFERENCE_RATES = Object.freeze({
  usdPerScriptToken: 0.000002,
  usdPerRenderSecond: 0.01,
  secondsPerShotEstimate: 2.5,
});

/**
 * Estimate cost/latency for a brief before the pipeline runs. Uses only the
 * brief's declared scene/shot counts, never a live provider response.
 */
export function estimateCost(brief) {
  const sceneCount = brief.fixtureScriptByAttempt[0].scenes.length;
  const shotCount = brief.fixtureStoryboardByAttempt[0].shots.length;

  const scriptTokensEst = sceneCount * 40 + 20;
  const renderSecondsEst = shotCount * REFERENCE_RATES.secondsPerShotEstimate;
  const usdEst =
    Math.round(
      (scriptTokensEst * REFERENCE_RATES.usdPerScriptToken +
        renderSecondsEst * REFERENCE_RATES.usdPerRenderSecond) *
        10000,
    ) / 10000;

  return { scriptTokensEst, renderSecondsEst, usdEst };
}
