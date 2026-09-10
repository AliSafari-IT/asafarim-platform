/**
 * Contract version. Bumped only on a breaking change to any schema in this
 * package. Additive fields (new optional keys, new enum members consumed
 * defensively) do NOT bump this — see docs/testora-tasksai-contract.md.
 *
 * Each payload also carries its own numeric `v` discriminant so a consumer
 * can reject or branch on a specific shape without inspecting this constant.
 */
export const CONTRACT_VERSION = "1.0.0" as const;

/** Per-payload schema versions. Kept here so every producer/consumer agrees. */
export const SCHEMA_VERSIONS = {
  runArtifactBundle: 1,
  provisionRequest: 1,
  provisionResponse: 1,
  webhookEnvelope: 1,
  greenLightCallback: 1,
  testDiagnosisProposal: 1,
} as const;
