/**
 * M13 slice G — independent feature flags for the five capabilities M13
 * added, plus the M12-era custom-domain flag re-exported so there is one
 * place to ask "what is turned on".
 *
 * Three rules these flags all follow, and the reasons they matter more here
 * than for an ordinary kill switch:
 *
 * 1. **Independent, not nested.** Turning off URL import must not turn off
 *    attachments; turning off planning must not turn off clarification. The
 *    slice G exit criterion is "each feature can be disabled without making
 *    history unreadable", which is only checkable if each is genuinely its
 *    own switch. There is deliberately no master `APPBUILDER_M13_ENABLED`
 *    that would let one typo silently disable five things.
 *
 * 2. **Disabled means "no new writes", never "hide the past".** A disabled
 *    flag gates the *ingress* path (upload, import, image analysis, plan
 *    creation, memory recall) and nothing else. Already-persisted
 *    attachments, references, memories, and plans stay listable, readable,
 *    downloadable, and exportable. Making history unreadable is the failure
 *    mode a rollback is supposed to avoid, so hiding rows behind a flag
 *    would defeat the point of having the flag.
 *
 * 3. **Process-wide env only, default ON except where a dependency is
 *    genuinely missing.** These are deploy-time decisions, not per-app
 *    settings an API caller can toggle (same reasoning as
 *    lib/customDomains/featureFlag.ts). Attachments/memory/planning default
 *    ON because slices B–E shipped them as the milestone's core behavior;
 *    vision and URL import default OFF because each depends on something an
 *    operator must consciously provide — a vision-capable provider
 *    deployment with documented retention, and an accepted outbound-request
 *    policy respectively (docs/appbuilder-m13-hardening-rollout.md).
 */

import type { EnvLike } from "./env";

/** One switch's resolved state, as reported to readiness and the workspace. */
export interface FeatureFlagState {
  key: M13FeatureFlag;
  envVar: string;
  enabled: boolean;
  /** True when nothing set the env var and the default applied. */
  usingDefault: boolean;
  /** What stops working while this is off — shown in readiness, not marketing copy. */
  disabledEffect: string;
}

export type M13FeatureFlag =
  | "attachments"
  | "vision"
  | "contextualMemory"
  | "planning"
  | "urlImports";

interface FlagDefinition {
  envVar: string;
  defaultEnabled: boolean;
  disabledEffect: string;
}

export const M13_FEATURE_FLAGS: Record<M13FeatureFlag, FlagDefinition> = {
  attachments: {
    envVar: "APPBUILDER_ATTACHMENTS_ENABLED",
    defaultEnabled: true,
    disabledEffect:
      "New conversation attachments cannot be uploaded or claimed. Attachments already claimed by a message stay visible, downloadable, and part of grounded context.",
  },
  vision: {
    envVar: "APPBUILDER_VISION_ENABLED",
    defaultEnabled: false,
    disabledEffect:
      "Images are never sent to the model. They stay attached and downloadable, and the grounded context discloses `vision_unavailable` rather than silently ignoring them.",
  },
  contextualMemory: {
    envVar: "APPBUILDER_CONTEXTUAL_MEMORY_ENABLED",
    defaultEnabled: true,
    disabledEffect:
      "Durable cross-turn memory is neither recalled into context nor written after a change. Stored memory rows are retained and still deleted with their source messages.",
  },
  planning: {
    envVar: "APPBUILDER_PLANNING_ENABLED",
    defaultEnabled: true,
    disabledEffect:
      "Multi-step plans are not created; a multi-step decision is executed as its first step only, with the remaining scope reported as an unmet gap. Existing plans stay readable and continue to advance.",
  },
  urlImports: {
    envVar: "APPBUILDER_URL_IMPORTS_ENABLED",
    defaultEnabled: false,
    disabledEffect:
      "No outbound reference fetch is made — import and refresh are refused. Previously imported references stay listable with provenance and keep grounding context, labelled by their real freshness.",
  },
};

function readFlag(
  flag: M13FeatureFlag,
  env: EnvLike = process.env
): FeatureFlagState {
  const def = M13_FEATURE_FLAGS[flag];
  const raw = env[def.envVar];
  // Only the exact strings "true"/"false" are honoured. A misspelled or
  // partially-written value falls back to the documented default instead of
  // being coerced — `APPBUILDER_VISION_ENABLED=yes` silently enabling image
  // upload to a provider is exactly the accident this avoids.
  const enabled = raw === "true" ? true : raw === "false" ? false : def.defaultEnabled;
  return {
    key: flag,
    envVar: def.envVar,
    enabled,
    usingDefault: raw !== "true" && raw !== "false",
    disabledEffect: def.disabledEffect,
  };
}

export function isFeatureEnabled(
  flag: M13FeatureFlag,
  env: EnvLike = process.env
): boolean {
  return readFlag(flag, env).enabled;
}

export function isAttachmentsEnabled(env?: EnvLike): boolean {
  return isFeatureEnabled("attachments", env);
}

export function isVisionEnabled(env?: EnvLike): boolean {
  return isFeatureEnabled("vision", env);
}

export function isContextualMemoryEnabled(env?: EnvLike): boolean {
  return isFeatureEnabled("contextualMemory", env);
}

export function isPlanningEnabled(env?: EnvLike): boolean {
  return isFeatureEnabled("planning", env);
}

export function isUrlImportsEnabled(env?: EnvLike): boolean {
  return isFeatureEnabled("urlImports", env);
}

/** Every flag's resolved state — for readiness, the workspace, and the rollout runbook. */
export function describeFeatureFlags(
  env: EnvLike = process.env
): FeatureFlagState[] {
  return (Object.keys(M13_FEATURE_FLAGS) as M13FeatureFlag[]).map((flag) =>
    readFlag(flag, env)
  );
}

/**
 * M13 slice G dark launch. When on, the grounded context and the model
 * decision are produced exactly as they would be for a real request, scored,
 * and recorded — and then thrown away without applying a single operation
 * (see lib/modification/shadow.ts). Independent of the five capability flags
 * because it answers a different question: not "should users have this" but
 * "would this have been right if they did".
 */
export function isShadowEvaluationEnabled(
  env: EnvLike = process.env
): boolean {
  return env.APPBUILDER_SHADOW_EVALUATION_ENABLED === "true";
}
