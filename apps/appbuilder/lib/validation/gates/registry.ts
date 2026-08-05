import type { GateDefinition } from "../types";
import { specSchemaValidityGate } from "./specSchemaValidity";
import { referenceIntegrityGate } from "./referenceIntegrity";
import { operationLegalityGate } from "./operationLegality";
import { registryValidityGate } from "./registryValidity";
import { previewRenderabilityGate } from "./previewRenderability";
import { permissionsAuthorizationGate } from "./permissionsAuthorization";
import { unsafeContentPolicyGate } from "./unsafeContentPolicy";
import { schemaEvolutionSafetyGate } from "./schemaEvolutionSafety";
import { fileStoragePolicyGate } from "./fileStoragePolicy";
import { requiredPagesRoutesGate } from "./requiredPagesRoutes";
import { accessibilityBaselineGate } from "./accessibilityBaseline";
import { responsiveLayoutBaselineGate } from "./responsiveLayoutBaseline";
import { crudSmokeGate } from "./crudSmoke";
import { roleDenialJourneysGate } from "./roleDenialJourneys";
import { workflowIdempotencyGate } from "./workflowIdempotency";
import { migrationDestructiveSafetyGate } from "./migrationDestructiveSafety";

/**
 * Bumped whenever a gate is added/removed, or an existing gate's semantics
 * change materially enough that an old run's recorded results should no
 * longer be compared apples-to-apples against a new one. Stamped onto every
 * `validation_runs.gateSetVersion` row at creation — an old run's evidence
 * stays reproducible/interpretable even after this catalog evolves (see
 * lib/db/schema.ts's validationRuns comment).
 */
export const GATE_SET_VERSION = "1.1.0";

/**
 * The full mandatory gate catalog (issue requirement: 16 gates spanning
 * spec/schema validity, operation legality, reference integrity,
 * component/template registry validity, preview renderability, permissions/
 * authorization, unsafe-content/URL policy, schema-evolution safety,
 * file/storage policy, required pages/routes, accessibility baseline,
 * responsive layout baseline, generated-data CRUD smoke, role-based denial,
 * workflow idempotency, and migration/destructive-change safety). Ordered
 * cheapest/most-structural first so a run fails fast on a schema-level
 * problem before spending time on a browser-driven smoke gate — see
 * lib/validation/pipeline.ts, which iterates this list in order but always
 * runs every gate (a fast-failing gate is not skipped; only its own
 * dependencies, like `preview_renderability` requiring a succeeded preview
 * build, are pre-checked).
 */
export const GATE_DEFINITIONS: readonly GateDefinition[] = [
  specSchemaValidityGate,
  referenceIntegrityGate,
  operationLegalityGate,
  registryValidityGate,
  previewRenderabilityGate,
  permissionsAuthorizationGate,
  unsafeContentPolicyGate,
  schemaEvolutionSafetyGate,
  fileStoragePolicyGate,
  requiredPagesRoutesGate,
  accessibilityBaselineGate,
  responsiveLayoutBaselineGate,
  crudSmokeGate,
  roleDenialJourneysGate,
  workflowIdempotencyGate,
  migrationDestructiveSafetyGate,
];

export function getGateDefinition(key: string): GateDefinition | undefined {
  return GATE_DEFINITIONS.find((g) => g.key === key);
}
