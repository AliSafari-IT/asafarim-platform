import "server-only";
import { eq } from "drizzle-orm";
import type { ProvisionTestsRequest, PendingScenarioState } from "@asafarim/testora-tasksai-contract";
import { db } from "@/db/client";
import { functionalRequirements, projects, provisions, testCases, testFixtures, testSuites } from "@/db/schema";
import {
  provisionFixtureId,
  provisionFrId,
  provisionSuiteId,
  scaffoldScript,
  scenarioCaseId,
} from "@/lib/provision";

export class ProvisionError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ProvisionError";
  }
}

export interface ProvisionScenario {
  scenarioId: string;
  criterionRef: string;
  state: PendingScenarioState;
}

export interface ProvisionOutcome {
  provisionId: string;
  scenarios: ProvisionScenario[];
}

/**
 * Registers (or re-registers) the pending-scenario scaffold for a TasksAI
 * feature (issue #262). Idempotent on `taskRef`: a second call for the same
 * task updates the existing provision's scaffold set — never duplicates it,
 * and never re-provisions a scenario a human has already promoted past
 * `pending` (title/script are only refreshed while a scenario is still a
 * scaffold).
 */
export async function provisionScenarios(
  request: ProvisionTestsRequest,
): Promise<ProvisionOutcome> {
  const project = await db.query.projects.findFirst({ where: eq(projects.id, request.appId) });
  if (!project) {
    throw new ProvisionError(`No app with id "${request.appId}"`, 404);
  }

  const existing = await db.query.provisions.findFirst({
    where: eq(provisions.taskRef, request.taskRef),
  });

  return existing ? updateProvision(existing, request) : createProvision(request);
}

async function createProvision(request: ProvisionTestsRequest): Promise<ProvisionOutcome> {
  const provisionId = request.provisionId;
  const frId = provisionFrId(provisionId);
  const suiteId = provisionSuiteId(provisionId);
  const fixtureId = provisionFixtureId(provisionId);

  await db.insert(functionalRequirements).values({
    id: frId,
    projectId: request.appId,
    title: request.featureTitle,
    description: `Provisioned from TasksAI task ${request.taskRef} (check ${request.checkRef}).`,
  });
  await db.insert(testSuites).values({ suiteId, frId, title: request.featureTitle });
  await db.insert(testFixtures).values({ fixtureId, suiteId, title: request.featureTitle });
  await db.insert(provisions).values({
    id: provisionId,
    projectId: request.appId,
    frId,
    taskRef: request.taskRef,
    checkRef: request.checkRef,
    featureTitle: request.featureTitle,
    callbackUrl: request.callbackUrl,
    requiredRuns: request.requiredRuns,
    causationId: request.causationId ?? null,
  });

  const scenarios: ProvisionScenario[] = [];
  for (const criterion of request.acceptanceCriteria) {
    const caseId = scenarioCaseId(provisionId, criterion.ref);
    await db.insert(testCases).values({
      caseId,
      fixtureId,
      title: criterion.text.slice(0, 500),
      scriptType: "scripted",
      script: scaffoldScript(criterion.text),
      scenarioState: "pending",
      provisionId,
      criterionRef: criterion.ref,
    });
    scenarios.push({ scenarioId: caseId, criterionRef: criterion.ref, state: "pending" });
  }

  return { provisionId, scenarios };
}

async function updateProvision(
  existing: typeof provisions.$inferSelect,
  request: ProvisionTestsRequest,
): Promise<ProvisionOutcome> {
  const provisionId = existing.id;

  await db
    .update(provisions)
    .set({
      checkRef: request.checkRef,
      featureTitle: request.featureTitle,
      callbackUrl: request.callbackUrl,
      requiredRuns: request.requiredRuns,
      causationId: request.causationId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(provisions.id, provisionId));
  await db
    .update(functionalRequirements)
    .set({ title: request.featureTitle, updatedAt: new Date() })
    .where(eq(functionalRequirements.id, existing.frId));
  await db
    .update(testSuites)
    .set({ title: request.featureTitle, updatedAt: new Date() })
    .where(eq(testSuites.suiteId, provisionSuiteId(provisionId)));

  const existingCases = await db.query.testCases.findMany({
    where: eq(testCases.provisionId, provisionId),
  });
  const byCriterion = new Map(existingCases.map((c) => [c.criterionRef, c]));
  const fixtureId = provisionFixtureId(provisionId);

  const scenarios: ProvisionScenario[] = [];
  for (const criterion of request.acceptanceCriteria) {
    const caseId = scenarioCaseId(provisionId, criterion.ref);
    const current = byCriterion.get(criterion.ref);

    if (!current) {
      await db.insert(testCases).values({
        caseId,
        fixtureId,
        title: criterion.text.slice(0, 500),
        scriptType: "scripted",
        script: scaffoldScript(criterion.text),
        scenarioState: "pending",
        provisionId,
        criterionRef: criterion.ref,
      });
      scenarios.push({ scenarioId: caseId, criterionRef: criterion.ref, state: "pending" });
      continue;
    }

    // Never overwrite work a human has already started on a promoted
    // scenario — only refresh title/script while it's still a scaffold.
    if (current.scenarioState === "pending") {
      await db
        .update(testCases)
        .set({
          title: criterion.text.slice(0, 500),
          script: scaffoldScript(criterion.text),
          updatedAt: new Date(),
        })
        .where(eq(testCases.caseId, current.caseId));
    }
    scenarios.push({
      scenarioId: current.caseId,
      criterionRef: criterion.ref,
      state: current.scenarioState,
    });
  }

  return { provisionId, scenarios };
}
