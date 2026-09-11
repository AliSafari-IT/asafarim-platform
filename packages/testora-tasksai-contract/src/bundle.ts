import { z } from "zod";

/**
 * Run-artifact bundle — the payload Testora produces on a failing or flaky
 * scenario and TasksAI reads to diagnose it (issues #258 / #259).
 *
 * Data minimisation (ADR-0002): this carries TEST artifacts only — DOM
 * snapshot, screenshot, video, step timeline, error. It never carries
 * application source code, and Testora never receives repo contents.
 */

export const Sha256 = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "expected a lowercase hex sha-256 digest");

export const StepStatus = z.enum(["passed", "failed", "skipped"]);
export type StepStatus = z.infer<typeof StepStatus>;

export const TimelineStep = z
  .object({
    index: z.number().int().nonnegative(),
    label: z.string().min(1).max(500),
    status: StepStatus,
    /** ms since the scenario started */
    startedAtMs: z.number().nonnegative(),
    durationMs: z.number().nonnegative(),
    /** TestCafe selector string, when the step targeted an element */
    selector: z.string().max(1000).optional(),
    errorMessage: z.string().max(5000).optional(),
  })
  .strict();
export type TimelineStep = z.infer<typeof TimelineStep>;

export const ArtifactKind = z.enum([
  "dom_snapshot",
  "screenshot",
  "video",
  "console_log",
  "network_har",
]);
export type ArtifactKind = z.infer<typeof ArtifactKind>;

/**
 * A pointer to a stored artifact. The URL is a short-lived, signed
 * object-storage URL — the bytes are never inlined in the bundle.
 */
export const ArtifactRef = z
  .object({
    kind: ArtifactKind,
    url: z.string().url(),
    bytes: z.number().int().nonnegative().optional(),
    contentType: z.string().max(255).optional(),
    sha256: Sha256.optional(),
    /** seconds until `url` stops resolving */
    expiresInSeconds: z.number().int().positive().optional(),
  })
  .strict();
export type ArtifactRef = z.infer<typeof ArtifactRef>;

export const BundleStatus = z.enum(["passed", "failed", "flaky"]);
export type BundleStatus = z.infer<typeof BundleStatus>;

export const ErrorClass = z.enum([
  "assertion",
  "timeout",
  "selector_not_found",
  "navigation",
  "network",
  "unknown",
]);
export type ErrorClass = z.infer<typeof ErrorClass>;

/** Pointer to the most recent passing run of the same scenario, so a consumer
 * can diff fail-vs-pass. Opaque ids only — no scenario body, no source. */
export const PreviousPassRef = z
  .object({
    resultId: z.string().min(1).max(200),
    runId: z.string().min(1).max(200).optional(),
    createdAt: z.string().datetime(),
  })
  .strict();
export type PreviousPassRef = z.infer<typeof PreviousPassRef>;

/**
 * Producer-side context that helps a consumer place the run in its hierarchy
 * and find a baseline. Optional and additive — a producer that has none omits
 * it entirely. Still test-artifact metadata only: titles and opaque ids, never
 * application source.
 */
export const RunBundleContext = z
  .object({
    suiteId: z.string().max(200).optional(),
    suiteTitle: z.string().max(500).optional(),
    fixtureId: z.string().max(200).optional(),
    fixtureTitle: z.string().max(500).optional(),
    requirementId: z.string().max(200).optional(),
    requirementTitle: z.string().max(500).optional(),
    /** 0-based attempt index within a multi-run case, when applicable */
    runIndex: z.number().int().nonnegative().nullable().optional(),
    /** deployment origin the run executed against (never a repo path) */
    targetBaseUrl: z.string().max(2000).nullable().optional(),
    previousPass: PreviousPassRef.nullable().optional(),
    /** automatic flake detection (issue #260) — pass rate over recent runs */
    flakeScore: z.number().min(0).max(1).nullable().optional(),
    /** excluded from a green-light check while true */
    quarantined: z.boolean().optional(),
  })
  .strict();
export type RunBundleContext = z.infer<typeof RunBundleContext>;

export const RunArtifactBundle = z
  .object({
    v: z.literal(1),
    bundleId: z.string().uuid(),
    runId: z.string().min(1).max(200),
    scenarioId: z.string().min(1).max(200),
    scenarioTitle: z.string().min(1).max(500),
    /** opaque app identifier shared by both sides, never a repo path */
    appId: z.string().min(1).max(200),
    status: BundleStatus,
    attempt: z.number().int().positive(),
    startedAt: z.string().datetime(),
    finishedAt: z.string().datetime(),
    browser: z.string().max(120).optional(),
    errorClass: ErrorClass.optional(),
    errorMessage: z.string().max(5000).optional(),
    steps: z.array(TimelineStep).max(2000),
    artifacts: z.array(ArtifactRef).max(50),
    /** optional, additive — see RunBundleContext */
    context: RunBundleContext.optional(),
  })
  .strict();
export type RunArtifactBundle = z.infer<typeof RunArtifactBundle>;

/** Parse + throw on invalid. Convenience for producers. */
export function parseRunArtifactBundle(input: unknown): RunArtifactBundle {
  return RunArtifactBundle.parse(input);
}
