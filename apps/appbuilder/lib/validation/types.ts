import type { ApplicationSpecificationType } from "@asafarim/appbuilder-schema";
import type { Db } from "../db/client";
import type { previewBuilds } from "../db/schema";

export type PreviewBuildRow = typeof previewBuilds.$inferSelect;

export type GateStatus = "passed" | "failed" | "skipped" | "infrastructure_error" | "flaky";

export interface GateFailure {
  /** Stable machine-readable reason, e.g. "orphaned_reference", "missing_read_permission". */
  code: string;
  message: string;
  path?: (string | number)[];
}

export type GateArtifactKind = "screenshot" | "trace" | "report" | "log" | "summary";

export interface GateArtifactInput {
  kind: GateArtifactKind;
  label: string;
  contentType: string;
  body: Buffer | string;
}

/**
 * What a gate's `execute` returns — the ONLY shape the pipeline persists.
 * There is deliberately no "passed: true, no evidence" shortcut: `evidence`
 * is required content on every terminal outcome (see
 * lib/validation/gates/registry.ts's docstring) precisely because "a gate
 * cannot be marked passed based on model narration ... must have
 * deterministic evidence" is a hard issue requirement, not a style
 * preference.
 */
export interface GateResult {
  status: GateStatus;
  /** Required when status === "skipped" (e.g. "specification defines zero workflows"). */
  skipReason?: string;
  /**
   * Set to `false` ONLY when a gate skips because the capability it checks
   * genuinely does not exist in this specification (e.g. zero workflows to
   * test idempotency for) — never for a skip caused by an environment or
   * fixture-coverage limitation (e.g. "this specification shape isn't
   * covered by the smoke harness yet"), which must stay mandatory so
   * eligibility is correctly withheld rather than silently granted for
   * something that was never actually verified. Persisted as this run's
   * `validation_gate_results.mandatory` (overriding the gate's static
   * catalog default) — see lib/validation/eligibility.ts.
   */
  mandatoryOverride?: boolean;
  failureCode?: string;
  failureMessage?: string;
  structuredFailures?: GateFailure[];
  /** Small, deterministic proof: counts, ids, checksums — never large blobs (those go in `artifacts`). */
  evidence?: Record<string, unknown>;
  artifacts?: GateArtifactInput[];
}

/**
 * Everything a gate needs to execute, pinned once at run creation (see
 * lib/repositories/validationRuns.ts#createValidationRun) and never
 * re-derived from the app's live/current state during execution — a gate
 * that needs "the current spec" must use `specPayload`, never re-query
 * `specifications.currentVersionNumber` itself, or two gates in the same
 * run could silently disagree about what they're validating.
 */
export interface GateContext {
  db: Db;
  appId: string;
  runId: string;
  specPayload: ApplicationSpecificationType;
  specVersionId: string;
  specVersionNumber: number;
  specChecksum: string;
  /** Null only for gates that run before a preview build could exist — every gate that needs rendering/smoke-testing requires this to be a succeeded build (enforced by lib/validation/pipeline.ts before dispatch). */
  previewBuild: PreviewBuildRow | null;
  registryVersion: string;
  /** The app owner's principal id — used only to mint a real, server-side session for browser-driven smoke gates (see lib/validation/smoke/harness.ts). Never itself a source of runtime permission; the generated app's own RBAC is still fully re-enforced on every request the smoke browser makes. */
  ownerPrincipalId: string;
  signal: AbortSignal;
}

export interface GateDefinition {
  key: string;
  /** Bumped whenever this gate's semantics materially change — an old run's persisted gateVersion stays reproducible even after the gate itself evolves. */
  version: string;
  /** Whether this gate counts toward release eligibility (lib/validation/eligibility.ts). A non-mandatory gate can still fail/pass/skip and is always shown in the builder UI, but never blocks release on its own. */
  mandatory: boolean;
  title: string;
  description: string;
  execute(ctx: GateContext): Promise<GateResult>;
}
