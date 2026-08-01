import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  createFakeProvider,
  value,
  errorStep,
  ProviderError,
  PLANNING_LIMITS,
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
  submitClarificationAnswers,
  transitionStatus,
  type GenerationJobRow,
} from "../repositories/generationJobs";
import { applyTemplateVersion } from "../repositories/templateApplication";
import { runGenerationJob } from "./pipeline";
import {
  creationRequests,
  generationJobs as generationJobsTable,
  generationOperationBatches,
  previewBuilds,
  specifications,
  specificationVersions,
} from "../db/schema";
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

describe("runGenerationJob — resuming a mid-flight \"applying\" status", () => {
  it("resumes cleanly after a crash between the planning->applying transition and the next one, instead of getting stuck in a dead end", async () => {
    // Reproduces a real production/dev failure: `runPlanningIteration`
    // commits `"planning" -> "applying"` and THEN calls the provider's
    // `proposeOperations`. If that call fails (a real transient provider
    // error — timeout, rate limit, brief outage), the job is correctly left
    // at "applying" for a retry... but `runPhase`'s switch had no case for
    // "applying" at all, so every retry (and the eventual stale-lease sweep
    // reclaim) hit its own `default:` branch and threw "Job is in a status
    // the worker does not know how to advance." — itself classified as
    // retryable, so it burned all 3 attempts hitting the exact same dead
    // end before finally failing for good.
    const script = {
      analyzeRequirements: [
        value({
          appPurpose: "A simple task tracker.",
          confidence: "high",
          entities: [{ name: "Task", importantFields: [{ name: "title" }] }],
          pages: [{ name: "Tasks", primaryEntity: "Task" }],
        }),
      ],
      recommendTemplate: [value({ templateId: "task_management", reasoningSummary: "Matches a task tracker.", confidence: "high" })],
      proposeOperations: [
        errorStep(new ProviderError({ code: "unavailable", message: "Simulated transient provider outage." })),
        value({ reasoningSummary: "Nothing more needed beyond the template.", isFinalBatch: true, operations: [] }),
      ],
    };

    const { job } = await makeAppAndJob("Build a simple task tracker.", "applying-resume");
    const provider = createFakeProvider(script);

    const claimed0 = await claimJobById(db, job.id, "test-worker-a0", 120_000);
    const firstAttempt = await runGenerationJob(
      { db, provider, workerId: "test-worker-a0", leaseDurationMs: 120_000, signal: new AbortController().signal },
      claimed0!,
    );
    // The simulated outage strikes AFTER the planning->applying transition
    // already committed — a retryable outcome, not a failure, and the job
    // is left sitting at "applying" in the database.
    expect(firstAttempt.kind).toBe("retry_later");

    const [midflight] = await db.select().from(generationJobsTable).where(eq(generationJobsTable.id, job.id));
    expect(midflight.status).toBe("applying");

    const reclaimed = await claimJobById(db, job.id, "test-worker-a1", 120_000);
    const secondAttempt = await runGenerationJob(
      { db, provider, workerId: "test-worker-a1", leaseDurationMs: 120_000, signal: new AbortController().signal },
      reclaimed!,
    );
    expect(secondAttempt.kind).toBe("yielded");
    if (secondAttempt.kind !== "yielded") throw new Error("unreachable");
    expect(secondAttempt.job.status).toBe("ready");
    expect(secondAttempt.job.failureCode).toBeNull();
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

  it("proceeds with its best-effort analysis once the round cap is hit, instead of discarding every answer already given", async () => {
    // Reproduces a real production failure: a model that keeps finding one
    // more thing to ask about never reaches "high" confidence, so every
    // round past PLANNING_LIMITS.MAX_CLARIFICATION_ROUNDS (3) used to throw
    // "Too many clarification rounds..." and fail the job outright —
    // discarding every answer the user had already given, however many
    // rounds (and however much real time) they had spent on it.
    const neverConvergesScript = {
      analyzeRequirements: [
        value({ appPurpose: "A team task manager.", confidence: "low", clarificationQuestions: [{ id: "q1", question: "What does your team track?" }] }),
        value({ appPurpose: "A team task manager.", confidence: "low", clarificationQuestions: [{ id: "q2", question: "How many team members?" }] }),
        value({ appPurpose: "A team task manager.", confidence: "low", clarificationQuestions: [{ id: "q3", question: "Any integrations needed?" }] }),
        // The 4th call: this is what round 4 (> the cap of 3) would have
        // asked. Still "low" confidence with a real question — the model
        // never actually converges — but it also already carries a usable
        // structure, exactly like every other call.
        value({
          appPurpose: "A team task manager for a small team.",
          confidence: "low",
          entities: [{ name: "Task", importantFields: [{ name: "title" }] }],
          pages: [{ name: "Tasks", primaryEntity: "Task" }],
          assumptions: ["Small team, no sub-teams."],
          clarificationQuestions: [{ id: "q4", question: "One more open question the model never lets go of." }],
        }),
      ],
      recommendTemplate: [value({ templateId: "task_management", reasoningSummary: "Matches a task manager.", confidence: "high" })],
      proposeOperations: [value({ reasoningSummary: "Template alone is sufficient.", isFinalBatch: true, operations: [] })],
    };

    const { job } = await makeAppAndJob("Build me a task manager for my team.", "never-converges");

    // ONE provider instance for the whole test: FakeAiProvider's scripted
    // steps are consumed by a per-method cursor that only advances on THIS
    // instance, so entries [0..3] must line up 1:1 with interpretation
    // attempts 1..4 (round 1 asked, round 2 asked, round 3 asked, then the
    // cap-triggering 4th attempt) — a second `createFakeProvider` call
    // would start its own cursor back at 0 and silently misalign which
    // scripted entry the cap-triggering call actually consumes.
    const provider = createFakeProvider(neverConvergesScript);
    const claimed0 = await claimJobById(db, job.id, "test-worker-r0", 120_000);
    let outcome = await runGenerationJob(
      { db, provider, workerId: "test-worker-r0", leaseDurationMs: 120_000, signal: new AbortController().signal },
      claimed0!,
    );

    // Rounds 1, 2, 3: answer and resume each time, exactly like a real user
    // working through the form across however many sessions it takes.
    for (let round = 1; round <= 3; round += 1) {
      expect(outcome.kind, `round ${round}`).toBe("yielded");
      if (outcome.kind !== "yielded") throw new Error("unreachable");
      expect(outcome.job.status, `round ${round}`).toBe("needs_clarification");

      const state = outcome.job.clarificationState as { rounds: Array<{ questions: Array<{ id: string }> }> };
      const openRound = state.rounds[state.rounds.length - 1];
      const resumed = await submitClarificationAnswers(db, owner, outcome.job.appId, outcome.job.id, {
        roundNumber: round,
        answers: openRound.questions.map((q) => ({ questionId: q.id, answer: `Round ${round} answer for ${q.id}.` })),
      });
      expect(resumed.status, `round ${round}`).toBe("analyzing");

      const claimed = await claimJobById(db, resumed.id, `test-worker-r${round}`, 120_000);
      outcome = await runGenerationJob(
        { db, provider, workerId: `test-worker-r${round}`, leaseDurationMs: 120_000, signal: new AbortController().signal },
        claimed!,
      );
    }

    // Round 4 would exceed the cap — the job must NOT fail, and must NOT
    // ask a 4th question. It proceeds using the analysis it already has.
    expect(outcome.kind).toBe("yielded");
    if (outcome.kind !== "yielded") throw new Error("unreachable");
    expect(outcome.job.status).not.toBe("failed");
    expect(outcome.job.status).not.toBe("needs_clarification");
    expect(outcome.job.failureCode).toBeNull();
    expect(outcome.job.status).toBe("ready");

    const normalized = outcome.job.normalizedRequirements as {
      clarificationQuestions: unknown[];
      assumptions: string[];
    };
    // The unresolved 4th question is preserved as a visible assumption,
    // never silently dropped.
    expect(normalized.clarificationQuestions).toEqual([]);
    expect(normalized.assumptions.some((a) => a.includes("One more open question"))).toBe(true);
  });

  it("never lets a full assumptions list silently truncate away the folded question that triggered the fallback", async () => {
    // A model that already emitted MAX_ASSUMPTIONS (20) assumptions, plus
    // one more clarification question on the round-cap-triggering call —
    // appending the folded question after 20 existing entries and slicing
    // to 20 would silently drop it, defeating the whole point of this
    // fallback (see PR #69 review).
    const maxedOutAnalysis = {
      appPurpose: "A team task manager.",
      confidence: "low" as const,
      assumptions: Array.from({ length: PLANNING_LIMITS.MAX_ASSUMPTIONS }, (_, i) => `Pre-existing assumption ${i + 1}.`),
      clarificationQuestions: [{ id: "qN", question: "The one question that must survive the fold." }],
    };
    const script = {
      analyzeRequirements: [
        value({ appPurpose: "A team task manager.", confidence: "low", clarificationQuestions: [{ id: "q1", question: "Q1?" }] }),
        value({ appPurpose: "A team task manager.", confidence: "low", clarificationQuestions: [{ id: "q2", question: "Q2?" }] }),
        value({ appPurpose: "A team task manager.", confidence: "low", clarificationQuestions: [{ id: "q3", question: "Q3?" }] }),
        value(maxedOutAnalysis),
      ],
      recommendTemplate: [value({ templateId: "task_management", reasoningSummary: "Matches.", confidence: "high" })],
      proposeOperations: [value({ reasoningSummary: "Template alone is sufficient.", isFinalBatch: true, operations: [] })],
    };

    const { job } = await makeAppAndJob("Build me a task manager for my team.", "maxed-out-assumptions");
    const provider = createFakeProvider(script);
    const claimed0 = await claimJobById(db, job.id, "test-worker-m0", 120_000);
    let outcome = await runGenerationJob(
      { db, provider, workerId: "test-worker-m0", leaseDurationMs: 120_000, signal: new AbortController().signal },
      claimed0!,
    );

    for (let round = 1; round <= 3; round += 1) {
      if (outcome.kind !== "yielded") throw new Error("unreachable");
      const state = outcome.job.clarificationState as { rounds: Array<{ questions: Array<{ id: string }> }> };
      const openRound = state.rounds[state.rounds.length - 1];
      const resumed = await submitClarificationAnswers(db, owner, outcome.job.appId, outcome.job.id, {
        roundNumber: round,
        answers: openRound.questions.map((q) => ({ questionId: q.id, answer: "ok" })),
      });
      const claimed = await claimJobById(db, resumed.id, `test-worker-m${round}`, 120_000);
      outcome = await runGenerationJob(
        { db, provider, workerId: `test-worker-m${round}`, leaseDurationMs: 120_000, signal: new AbortController().signal },
        claimed!,
      );
    }

    if (outcome.kind !== "yielded") throw new Error("unreachable");
    expect(outcome.job.status).toBe("ready");
    const normalized = outcome.job.normalizedRequirements as { assumptions: string[] };
    expect(normalized.assumptions.length).toBeLessThanOrEqual(PLANNING_LIMITS.MAX_ASSUMPTIONS);
    expect(normalized.assumptions.some((a) => a.includes("The one question that must survive the fold"))).toBe(true);
  });
});

describe("runGenerationJob — retry and cancellation", () => {
  it("returns retry_later for a retryable provider timeout, leaving the job non-terminal and re-claimable", async () => {
    const { job } = await makeAppAndJob("Build a CRM for my sales team.", "retry");
    const outcome = await claimAndRun(job, TIMEOUT_THEN_RETRY_SCRIPT);
    expect(outcome.kind).toBe("retry_later");
    if (outcome.kind !== "retry_later") throw new Error("unreachable");
    // #64: this asserted `provider_unavailable` while the test's own name
    // said "timeout" — it was encoding the conflation that made a timeout
    // read as an outage. A timeout is still retryable; it just says what it
    // actually was now.
    expect(outcome.error.code).toBe("provider_timeout");
    expect(outcome.error.retryable).toBe(true);
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
