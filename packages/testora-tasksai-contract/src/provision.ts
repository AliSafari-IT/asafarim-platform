import { z } from "zod";

/**
 * Provision contract — TasksAI asks Testora to stand up pending scenarios
 * from a feature's acceptance criteria and to call back when they go green
 * (issues #262 / #266 / #263).
 *
 * Data minimisation (ADR-0002): TasksAI sends the feature title, the
 * acceptance-criteria text, and OPAQUE refs (task / check / criterion ids).
 * No task PII, no workspace-member data, no comments.
 */

export const AcceptanceCriterion = z
  .object({
    /** opaque criterion id inside TasksAI */
    ref: z.string().min(1).max(200),
    text: z.string().min(1).max(2000),
  })
  .strict();
export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterion>;

export const ProvisionTestsRequest = z
  .object({
    v: z.literal(1),
    provisionId: z.string().uuid(),
    /** opaque TasksAI task id */
    taskRef: z.string().min(1).max(200),
    /** opaque TasksAI TaskCheck id the green-light callback resolves */
    checkRef: z.string().min(1).max(200),
    featureTitle: z.string().min(1).max(500),
    acceptanceCriteria: z.array(AcceptanceCriterion).min(1).max(100),
    appId: z.string().min(1).max(200),
    /** absolute URL Testora POSTs the signed green-light callback to */
    callbackUrl: z.string().url(),
    /** clean consecutive runs Testora must observe before green-light */
    requiredRuns: z.number().int().min(1).max(20).default(3),
    /** loop guard — mirrors the automations engine causation chain */
    causationId: z.string().min(1).max(200).optional(),
  })
  .strict();
export type ProvisionTestsRequest = z.infer<typeof ProvisionTestsRequest>;

export const PendingScenarioState = z.enum([
  "pending",
  "authoring",
  "active",
  "passing",
  "failing",
  "quarantined",
]);
export type PendingScenarioState = z.infer<typeof PendingScenarioState>;

export const ProvisionedScenario = z
  .object({
    scenarioId: z.string().min(1).max(200),
    criterionRef: z.string().min(1).max(200),
    state: PendingScenarioState,
  })
  .strict();
export type ProvisionedScenario = z.infer<typeof ProvisionedScenario>;

export const ProvisionTestsResponse = z
  .object({
    v: z.literal(1),
    provisionId: z.string().uuid(),
    scenarios: z.array(ProvisionedScenario).max(100),
  })
  .strict();
export type ProvisionTestsResponse = z.infer<typeof ProvisionTestsResponse>;
