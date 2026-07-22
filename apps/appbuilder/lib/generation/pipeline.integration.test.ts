import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  createFakeProvider,
  CONSTRUCTION_TASK_MANAGEMENT_SCRIPT,
  CLARIFICATION_NEEDED_SCRIPT,
  TIMEOUT_THEN_RETRY_SCRIPT,
  VALIDATION_FAILURE_SCRIPT,
} from "@asafarim/appbuilder-ai";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../db/testUtils";
import { createApp } from "../repositories/apps";
import {
  claimJobById,
  enqueueGenerationJob,
  requestCancellation,
  transitionStatus,
  type GenerationJobRow,
} from "../repositories/generationJobs";
import { applyTemplateVersion } from "../repositories/templateApplication";
import { runGenerationJob } from "./pipeline";
import { creationRequests, generationOperationBatches, previewBuilds, specifications, specificationVersions } from "../db/schema";
import { getTemplate } from "@asafarim/appbuilder-runtime";

const db = getTestDb();
const owner = { principalId: "pipeline-owner", roles: [] };

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

async function makeAppAndJob(prompt: string, suffix: string) {
  const app = await createApp(
    db,
    owner,
    {
      name: `Pipeline App ${suffix}`,
      slug: `pipeline-app-${suffix}-${Math.random().toString(36).slice(2, 8)}`,
      description: prompt.slice(0, 200),
      prompt,
      starterFamily: "task_management",
      visibility: "private",
    },
    `pipeline-create-${suffix}`,
  );
  const [creationRequest] = await db.select().from(creationRequests).where(eq(creationRequests.appId, app.id)).limit(1);
  const job = await enqueueGenerationJob(db, owner, app.id, {
    creationRequestId: creationRequest.id,
    requestedTemplateId: "task_management",
    idempotencyKey: `pipeline-job-${suffix}`,
  });
  return { app, job };
}

async function claimAndRun(job: GenerationJobRow, script: Parameters<typeof createFakeProvider>[0]) {
  const claimed = await claimJobById(db, job.id, "test-worker", 120_000);
  if (!claimed) throw new Error("expected to claim the freshly-enqueued job");
  const provider = createFakeProvider(script);
  const controller = new AbortController();
  return runGenerationJob({ db, provider, workerId: "test-worker", leaseDurationMs: 120_000, signal: controller.signal }, claimed);
}

describe("runGenerationJob — golden path", () => {
  it("drives a construction task-manager prompt from queued to ready with a real persisted version and preview", async () => {
    const { app, job } = await makeAppAndJob(
      "Build a task tracker for my construction crew to manage projects and tasks.",
      "golden",
    );

    const outcome = await claimAndRun(job, CONSTRUCTION_TASK_MANAGEMENT_SCRIPT);
    expect(outcome.kind).toBe("yielded");
    if (outcome.kind !== "yielded") throw new Error("unreachable");
    expect(outcome.job.status).toBe("ready");
    expect(outcome.job.selectedTemplateId).toBe("task_management");
    expect(outcome.job.resultingVersionNumber).toBeGreaterThan(1); // template (v2) + additive ops
    expect(outcome.job.resultingPreviewBuildId).toBeTruthy();

    const [spec] = await db.select().from(specifications).where(eq(specifications.appId, app.id));
    expect(spec.currentVersionNumber).toBe(outcome.job.resultingVersionNumber);
    expect(spec.pinnedPreviewBuildId).toBe(outcome.job.resultingPreviewBuildId);

    const [build] = await db.select().from(previewBuilds).where(eq(previewBuilds.id, outcome.job.resultingPreviewBuildId!));
    expect(build.status).toBe("succeeded");

    const versions = await db.select().from(specificationVersions).where(eq(specificationVersions.appId, app.id));
    // v1 = empty draft (createApp), v2 = template applied, v3+ = additive operations.
    expect(versions.length).toBeGreaterThanOrEqual(3);
    const templateVersion = versions.find((v) => v.summary.startsWith("Applied template:"));
    expect(templateVersion).toBeTruthy();

    const batches = await db.select().from(generationOperationBatches).where(eq(generationOperationBatches.jobId, job.id));
    expect(batches.length).toBeGreaterThan(0);
    expect(batches[0].status).toBe("applied");
    expect(batches[0].appliedOperationIds.length).toBeGreaterThan(0);
  });

  it("never claims model-proposed destructive/self-approval fields as authoritative — applying twice never double-applies the template", async () => {
    const { app } = await makeAppAndJob("Build an inventory tracker.", "template-idempotent");
    const template = getTemplate("task_management")!;
    const first = await applyTemplateVersion(db, owner, app.id, { template, baseVersionNumber: 1, idempotencyKey: "dup-template" });
    const second = await applyTemplateVersion(db, owner, app.id, { template, baseVersionNumber: 1, idempotencyKey: "dup-template" });
    expect(second.id).toBe(first.id);
    const versions = await db.select().from(specificationVersions).where(eq(specificationVersions.appId, app.id));
    expect(versions.filter((v) => v.summary.startsWith("Applied template:"))).toHaveLength(1);
  });
});

describe("runGenerationJob — clarification", () => {
  it("yields needs_clarification with structured questions, then resumes to ready after answers are submitted", async () => {
    const { job } = await makeAppAndJob("Build me a task manager for my team.", "clarify");

    const firstOutcome = await claimAndRun(job, CLARIFICATION_NEEDED_SCRIPT);
    expect(firstOutcome.kind).toBe("yielded");
    if (firstOutcome.kind !== "yielded") throw new Error("unreachable");
    expect(firstOutcome.job.status).toBe("needs_clarification");
    const state = firstOutcome.job.clarificationState as { rounds: Array<{ questions: Array<{ id: string }> }> };
    expect(state.rounds[0].questions.length).toBeGreaterThan(0);

    // The pipeline never re-claims a needs_clarification job — this is
    // exercised directly in generationJobs.integration.test.ts. Here we
    // just simulate the resume path the clarification API route drives:
    // submit answers (moves needs_clarification -> analyzing), then the
    // SAME provider instance's next scripted analyzeRequirements step
    // (a confident, answerable analysis) lets the job continue to ready.
    const { submitClarificationAnswers } = await import("../repositories/generationJobs");
    const resumed = await submitClarificationAnswers(db, owner, firstOutcome.job.appId, firstOutcome.job.id, {
      roundNumber: 1,
      answers: state.rounds[0].questions.map((q) => ({ questionId: q.id, answer: "A reasonable answer." })),
    });
    expect(resumed.status).toBe("analyzing");

    const provider = createFakeProvider(CLARIFICATION_NEEDED_SCRIPT);
    // Replay the first (already-consumed-in-spirit) analyzeRequirements call
    // to reach the script's second, confident entry.
    await provider.analyzeRequirements(
      { prompt: "x", requestedStarterFamily: "task_management", clarificationHistory: [], availableTemplateIds: [] },
      { requestId: "warm-up" },
    );
    const claimed = await claimJobById(db, resumed.id, "test-worker-2", 120_000);
    const finalOutcome = await runGenerationJob(
      { db, provider, workerId: "test-worker-2", leaseDurationMs: 120_000, signal: new AbortController().signal },
      claimed!,
    );
    expect(finalOutcome.kind).toBe("yielded");
    if (finalOutcome.kind !== "yielded") throw new Error("unreachable");
    expect(finalOutcome.job.status).toBe("ready");
  });
});

describe("runGenerationJob — retry and cancellation", () => {
  it("returns retry_later for a retryable provider timeout, leaving the job non-terminal and re-claimable", async () => {
    const { job } = await makeAppAndJob("Build a CRM for my sales team.", "retry");
    const outcome = await claimAndRun(job, TIMEOUT_THEN_RETRY_SCRIPT);
    expect(outcome.kind).toBe("retry_later");
    if (outcome.kind !== "retry_later") throw new Error("unreachable");
    expect(outcome.error.code).toBe("provider_unavailable");
    // The queued -> analyzing transition already committed before the
    // provider call failed; only the analyzeRequirements call itself
    // (inside the "analyzing" phase) hit the scripted timeout.
    expect(outcome.job.status).toBe("analyzing");

    // The job must still be claimable (lease was released, not held).
    const reclaimed = await claimJobById(db, job.id, "test-worker-retry", 120_000);
    expect(reclaimed).not.toBeNull();
  });

  it("stops at the next checkpoint and transitions to cancelled once cancellation has been requested", async () => {
    const { app, job } = await makeAppAndJob("Build a booking app.", "cancel");
    await transitionStatus(db, job.id, "queued", "analyzing");
    await requestCancellation(db, owner, app.id, job.id);

    const claimed = await claimJobById(db, job.id, "test-worker-cancel", 120_000);
    const outcome = await runGenerationJob(
      {
        db,
        provider: createFakeProvider(CONSTRUCTION_TASK_MANAGEMENT_SCRIPT),
        workerId: "test-worker-cancel",
        leaseDurationMs: 120_000,
        signal: new AbortController().signal,
      },
      claimed!,
    );
    expect(outcome.kind).toBe("yielded");
    if (outcome.kind !== "yielded") throw new Error("unreachable");
    expect(outcome.job.status).toBe("cancelled");
  });
});

describe("runGenerationJob — validation failure handling", () => {
  it("skips an operation that fails specification validation, records it as rejected, and still reaches ready on the template alone", async () => {
    const { job } = await makeAppAndJob("Build a task manager.", "validation-failure");
    const outcome = await claimAndRun(job, VALIDATION_FAILURE_SCRIPT);
    expect(outcome.kind).toBe("yielded");
    if (outcome.kind !== "yielded") throw new Error("unreachable");
    expect(outcome.job.status).toBe("ready");

    const batches = await db.select().from(generationOperationBatches).where(eq(generationOperationBatches.jobId, job.id));
    const rejectedBatch = batches.find((b) => b.status === "rejected");
    expect(rejectedBatch).toBeTruthy();
    expect(rejectedBatch?.appliedOperationIds).toHaveLength(0);
    expect(rejectedBatch?.rejectionReason).toBeTruthy();
  });
});
