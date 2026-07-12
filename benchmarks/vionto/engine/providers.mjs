/*
 * Provider interface for the pipeline's expensive stages (script generation,
 * rendering). This benchmark ships exactly one implementation —
 * `FixtureProvider`, which is entirely deterministic and reads from committed
 * fixtures. `LiveProviderStub` documents the seam a real adapter (OpenAI,
 * Anthropic, a render farm, etc.) would fill, but is intentionally
 * unimplemented: selecting it always throws, even with explicit
 * confirmation, because no live provider integration exists in this repo.
 *
 * @typedef {Object} ScriptProvider
 * @property {(brief: object) => {value: object, tokensEst: number}} generateScript
 *
 * @typedef {Object} RenderProvider
 * @property {(assetPlan: object, opts: {attempt: number}) => {success: boolean, error?: string, secondsEst: number}} render
 */

/** Pick the fixture for this attempt, clamped to the last entry once retries exhaust the list. */
function byAttempt(list, attempt) {
  return list[Math.min(attempt, list.length - 1)];
}

/**
 * The only provider wired up in this benchmark. Every "generation" is a
 * lookup into the brief's own committed fixture data — there is no live
 * model call, so results are byte-identical across runs.
 *
 * Each generation method is indexed by `attempt` (the job's retry count).
 * Most briefs declare a single fixture per stage, so every attempt returns
 * the same value. A brief seeding a schema-validation failure declares two
 * asset-plan fixtures — a broken one at attempt 0, a valid one from attempt 1
 * on — which is what makes "retry recovers from a seeded failure" true and
 * reproducible rather than hand-waved.
 *
 * @type {ScriptProvider & RenderProvider & {
 *   generateStoryboard: (script: object, brief: object, opts: {attempt: number}) => {value: object},
 *   generateAssetPlan: (storyboard: object, brief: object, opts: {attempt: number}) => {value: object},
 * }}
 */
export const FixtureProvider = {
  generateScript(brief, { attempt } = { attempt: 0 }) {
    const value = byAttempt(brief.fixtureScriptByAttempt, attempt);
    return { value, tokensEst: value.scenes.length * 40 + 20 };
  },
  generateStoryboard(_script, brief, { attempt } = { attempt: 0 }) {
    return { value: byAttempt(brief.fixtureStoryboardByAttempt, attempt) };
  },
  generateAssetPlan(_storyboard, brief, { attempt } = { attempt: 0 }) {
    return { value: byAttempt(brief.fixtureAssetPlanByAttempt, attempt) };
  },
  /**
   * Simulates the render stage. `attempt` is the job's retry count (0 on the
   * first attempt). Briefs marked `failsRenderOnFirstAttempt` fail
   * deterministically at attempt 0 and succeed on any retry — a controlled,
   * reproducible "transient failure recovered by retry" case.
   */
  render(assetPlan, { attempt }) {
    const forcedFailure = assetPlan.__failsRenderOnFirstAttempt && attempt === 0;
    if (forcedFailure) {
      return {
        success: false,
        error: "Render worker reported a transient encode error (seeded).",
        secondsEst: 0,
      };
    }
    return { success: true, secondsEst: assetPlan.assets.length * 2.5 };
  },
};

function refuse() {
  throw new Error(
    "LiveProviderStub is not implemented in this benchmark. This repo ships fixture mode only — " +
      "see docs/vionto-benchmark.md for the adapter interface a real integration would implement.",
  );
}

/**
 * Documents the seam for a real provider. Every method throws unconditionally
 * — passing `confirmLive: true` does not enable it. It exists so the shape of
 * "optional provider adapters behind an explicit flag" is concrete and typed,
 * without this repo ever making a live network call.
 */
export const LiveProviderStub = {
  generateScript(_brief, { confirmLive } = {}) {
    if (!confirmLive) throw new Error("LiveProviderStub requires { confirmLive: true }.");
    refuse();
  },
  render(_assetPlan, { confirmLive } = {}) {
    if (!confirmLive) throw new Error("LiveProviderStub requires { confirmLive: true }.");
    refuse();
  },
};
