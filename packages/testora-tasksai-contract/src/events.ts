import { z } from "zod";
import { RunArtifactBundle } from "./bundle.js";
import { PendingScenarioState } from "./provision.js";

/**
 * Webhook event envelope + payloads exchanged over signed HTTP both
 * directions (issues #261 / #263 / #264). Every delivery is HMAC-signed —
 * see signing.ts. No user session ever crosses the boundary.
 */

export const WebhookEventType = z.enum([
  "run.completed",
  "regression.detected",
  "flake.detected",
  "check.updated",
  "greenlight.reached",
]);
export type WebhookEventType = z.infer<typeof WebhookEventType>;

export const EventSource = z.enum(["testora", "tasks-ai"]);
export type EventSource = z.infer<typeof EventSource>;

/** Bundle inline, or a signed URL to fetch it from — producer's choice. */
export const BundleReference = z
  .object({
    bundleId: z.string().uuid(),
    inline: RunArtifactBundle.optional(),
    url: z.string().url().optional(),
  })
  .strict()
  .refine((v) => v.inline !== undefined || v.url !== undefined, {
    message: "bundle reference needs either `inline` or `url`",
  });
export type BundleReference = z.infer<typeof BundleReference>;

export const RunCompletedData = z
  .object({
    runId: z.string().min(1).max(200),
    appId: z.string().min(1).max(200),
    total: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    flaky: z.number().int().nonnegative(),
  })
  .strict();
export type RunCompletedData = z.infer<typeof RunCompletedData>;

export const RegressionDetectedData = z
  .object({
    scenarioId: z.string().min(1).max(200),
    scenarioTitle: z.string().min(1).max(500),
    appId: z.string().min(1).max(200),
    previousStatus: z.enum(["passed", "flaky"]),
    runsSinceLastPass: z.number().int().nonnegative(),
    bundle: BundleReference,
  })
  .strict();
export type RegressionDetectedData = z.infer<typeof RegressionDetectedData>;

export const FlakeDetectedData = z
  .object({
    scenarioId: z.string().min(1).max(200),
    scenarioTitle: z.string().min(1).max(500),
    appId: z.string().min(1).max(200),
    /** fraction in [0,1] of passing attempts across the sample */
    passRate: z.number().min(0).max(1),
    sampleSize: z.number().int().positive(),
    quarantined: z.boolean(),
    bundle: BundleReference.optional(),
  })
  .strict();
export type FlakeDetectedData = z.infer<typeof FlakeDetectedData>;

export const CheckUpdatedData = z
  .object({
    checkRef: z.string().min(1).max(200),
    taskRef: z.string().min(1).max(200),
    provisionId: z.string().uuid(),
    state: PendingScenarioState,
  })
  .strict();
export type CheckUpdatedData = z.infer<typeof CheckUpdatedData>;

/** Green-light callback (#263). `verdict: "green"` is the only state that
 * unblocks a TasksAI TaskCheck; everything else keeps it pending. */
export const GreenLightData = z
  .object({
    provisionId: z.string().uuid(),
    taskRef: z.string().min(1).max(200),
    checkRef: z.string().min(1).max(200),
    verdict: z.enum(["green", "not_green"]),
    cleanRuns: z.number().int().nonnegative(),
    requiredRuns: z.number().int().positive(),
    flakeCount: z.number().int().nonnegative(),
    artifactsComplete: z.boolean(),
    scenarios: z
      .array(
        z
          .object({
            scenarioId: z.string().min(1).max(200),
            criterionRef: z.string().min(1).max(200),
            state: PendingScenarioState,
          })
          .strict(),
      )
      .max(100),
    /** present when verdict is not_green */
    reason: z.string().max(2000).optional(),
  })
  .strict();
export type GreenLightData = z.infer<typeof GreenLightData>;

export const WebhookEnvelope = z
  .object({
    v: z.literal(1),
    deliveryId: z.string().uuid(),
    eventType: WebhookEventType,
    occurredAt: z.string().datetime(),
    source: EventSource,
    /** loop guard — carried onto anything provisioned as a result */
    causationId: z.string().max(200).optional(),
    data: z.unknown(),
  })
  .strict();
export type WebhookEnvelope = z.infer<typeof WebhookEnvelope>;

/** Map an event type to the zod schema for its `data`. */
export const EVENT_DATA_SCHEMA = {
  "run.completed": RunCompletedData,
  "regression.detected": RegressionDetectedData,
  "flake.detected": FlakeDetectedData,
  "check.updated": CheckUpdatedData,
  "greenlight.reached": GreenLightData,
} as const;

/**
 * Parse an envelope AND its `data` against the schema for its `eventType`.
 * Returns a fully-typed discriminated result.
 */
export function parseWebhookEvent(input: unknown):
  | { ok: true; envelope: WebhookEnvelope; eventType: WebhookEventType; data: unknown }
  | { ok: false; error: string } {
  const envelope = WebhookEnvelope.safeParse(input);
  if (!envelope.success) {
    return { ok: false, error: envelope.error.message };
  }
  const dataSchema = EVENT_DATA_SCHEMA[envelope.data.eventType];
  const data = dataSchema.safeParse(envelope.data.data);
  if (!data.success) {
    return { ok: false, error: data.error.message };
  }
  return {
    ok: true,
    envelope: envelope.data,
    eventType: envelope.data.eventType,
    data: data.data,
  };
}

/**
 * Test-diagnosis proposal (#264) — the audited draft TasksAI's
 * `test_diagnosis` AI kind drops on the board. AI-off fallback produces a
 * deterministic templated task instead of this.
 */
export const TestDiagnosisCategory = z.enum([
  "locator",
  "timing_race",
  "real_regression",
  "environment",
  "unknown",
]);
export type TestDiagnosisCategory = z.infer<typeof TestDiagnosisCategory>;

export const TestDiagnosisProposal = z
  .object({
    v: z.literal(1),
    bundleId: z.string().uuid(),
    scenarioId: z.string().min(1).max(200),
    category: TestDiagnosisCategory,
    confidence: z.number().min(0).max(1),
    /** best guess at the file to look at — a path string, never file contents */
    suspectedFile: z.string().max(500).optional(),
    rationale: z.string().min(1).max(5000),
    suggestedFix: z.string().max(5000).optional(),
  })
  .strict();
export type TestDiagnosisProposal = z.infer<typeof TestDiagnosisProposal>;
