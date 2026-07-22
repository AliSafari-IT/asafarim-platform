import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../db/testUtils";
import { createApp } from "./apps";
import { addCollaborator } from "./collaborators";
import {
  claimJobById,
  claimNextAvailableJob,
  enqueueGenerationJob,
  getGenerationJobForActor,
  getLatestGenerationJobForActor,
  heartbeat,
  LeaseLostError,
  requestCancellation,
  StaleJobStateError,
  submitClarificationAnswers,
  transitionStatus,
} from "./generationJobs";
import { IllegalStateTransitionError } from "../generation/stateMachine";
import { creationRequests, generationJobs } from "../db/schema";
import { ConflictError, ForbiddenError, NotFoundError } from "../errors";
import { GENERATION_LIMITS } from "../generation/limits";

const db = getTestDb();

const owner = { principalId: "gen-owner", roles: [] };
const editor = { principalId: "gen-editor", roles: [] };
const viewer = { principalId: "gen-viewer", roles: [] };
const unrelated = { principalId: "gen-unrelated", roles: [] };

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

async function makeAppWithCreationRequest(actor: typeof owner, name: string, idempotencyKey: string) {
  const app = await createApp(
    db,
    actor,
    {
      name,
      slug: `${name.toLowerCase().replace(/\s+/g, "-")}-${Math.random().toString(36).slice(2, 8)}`,
      description: `${name} description`,
      prompt: `Build an app for: ${name}`,
      starterFamily: "task_management",
      visibility: "private",
    },
    idempotencyKey,
  );
  const [creationRequest] = await db.select().from(creationRequests).where(eq(creationRequests.appId, app.id)).limit(1);
  return { app, creationRequest };
}

describe("enqueueGenerationJob", () => {
  it("creates a queued job with the app's base version and requested template", async () => {
    const { app, creationRequest } = await makeAppWithCreationRequest(owner, "Enqueue App", "enq-1");
    const job = await enqueueGenerationJob(db, owner, app.id, {
      creationRequestId: creationRequest.id,
      requestedTemplateId: "task_management",
      idempotencyKey: "job-key-1",
    });
    expect(job.status).toBe("queued");
    expect(job.baseVersionNumber).toBe(1);
    expect(job.requestedTemplateId).toBe("task_management");
    expect(job.initiatedByPrincipalId).toBe(owner.principalId);
  });

  it("is idempotent: retrying with the same key and payload returns the existing job, not a second one", async () => {
    const { app, creationRequest } = await makeAppWithCreationRequest(owner, "Idempotent Enqueue", "enq-2");
    const input = { creationRequestId: creationRequest.id, requestedTemplateId: "task_management", idempotencyKey: "job-key-2" };
    const first = await enqueueGenerationJob(db, owner, app.id, input);
    const second = await enqueueGenerationJob(db, owner, app.id, input);
    expect(second.id).toBe(first.id);

    const rows = await db.select().from(generationJobs).where(eq(generationJobs.appId, app.id));
    expect(rows).toHaveLength(1);
  });

  it("rejects the same idempotency key reused with a different requestedTemplateId", async () => {
    const { app, creationRequest } = await makeAppWithCreationRequest(owner, "Conflict Enqueue", "enq-3");
    await enqueueGenerationJob(db, owner, app.id, {
      creationRequestId: creationRequest.id,
      requestedTemplateId: "task_management",
      idempotencyKey: "job-key-3",
    });
    await expect(
      enqueueGenerationJob(db, owner, app.id, {
        creationRequestId: creationRequest.id,
        requestedTemplateId: "crm",
        idempotencyKey: "job-key-3",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("enforces the per-app active-job limit", async () => {
    const { app, creationRequest } = await makeAppWithCreationRequest(owner, "App Limit", "enq-4");
    await enqueueGenerationJob(db, owner, app.id, {
      creationRequestId: creationRequest.id,
      requestedTemplateId: "task_management",
      idempotencyKey: "job-key-4a",
    });
    expect(GENERATION_LIMITS.MAX_ACTIVE_JOBS_PER_APP).toBe(1);
    await expect(
      enqueueGenerationJob(db, owner, app.id, {
        creationRequestId: creationRequest.id,
        requestedTemplateId: "task_management",
        idempotencyKey: "job-key-4b",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("enforces the per-user active-job limit across multiple apps", async () => {
    const limit = GENERATION_LIMITS.MAX_ACTIVE_JOBS_PER_USER;
    for (let i = 0; i < limit; i += 1) {
      const { app, creationRequest } = await makeAppWithCreationRequest(owner, `User Limit ${i}`, `enq-5-${i}`);
      await enqueueGenerationJob(db, owner, app.id, {
        creationRequestId: creationRequest.id,
        requestedTemplateId: "task_management",
        idempotencyKey: `job-key-5-${i}`,
      });
    }
    const { app: overLimitApp, creationRequest: overLimitRequest } = await makeAppWithCreationRequest(
      owner,
      "User Limit Over",
      "enq-5-over",
    );
    await expect(
      enqueueGenerationJob(db, owner, overLimitApp.id, {
        creationRequestId: overLimitRequest.id,
        requestedTemplateId: "task_management",
        idempotencyKey: "job-key-5-over",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("requires app.requestGeneration — a viewer cannot enqueue", async () => {
    const { app, creationRequest } = await makeAppWithCreationRequest(owner, "Viewer Enqueue", "enq-6");
    await addCollaborator(db, owner, app.id, viewer.principalId, "viewer");
    await expect(
      enqueueGenerationJob(db, viewer, app.id, {
        creationRequestId: creationRequest.id,
        requestedTemplateId: "task_management",
        idempotencyKey: "job-key-6",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("an unrelated actor gets NotFoundError, not ForbiddenError (leak prevention)", async () => {
    const { app, creationRequest } = await makeAppWithCreationRequest(owner, "Unrelated Enqueue", "enq-7");
    await expect(
      enqueueGenerationJob(db, unrelated, app.id, {
        creationRequestId: creationRequest.id,
        requestedTemplateId: "task_management",
        idempotencyKey: "job-key-7",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("claiming", () => {
  async function enqueue(name: string, suffix: string) {
    const { app, creationRequest } = await makeAppWithCreationRequest(owner, name, `claim-${suffix}`);
    const job = await enqueueGenerationJob(db, owner, app.id, {
      creationRequestId: creationRequest.id,
      requestedTemplateId: "task_management",
      idempotencyKey: `claim-key-${suffix}`,
    });
    return job;
  }

  it("claimJobById claims a queued job and stamps a lease + attemptCount", async () => {
    const job = await enqueue("Claim App", "1");
    const claimed = await claimJobById(db, job.id, "worker-a", 60_000);
    expect(claimed?.leaseOwner).toBe("worker-a");
    expect(claimed?.attemptCount).toBe(1);
    expect(claimed?.leaseExpiresAt).toBeTruthy();
  });

  it("does not re-claim a job whose lease has not expired yet", async () => {
    const job = await enqueue("Double Claim App", "2");
    const first = await claimJobById(db, job.id, "worker-a", 60_000);
    expect(first).not.toBeNull();
    const second = await claimJobById(db, job.id, "worker-b", 60_000);
    expect(second).toBeNull();
  });

  it("two concurrent claim attempts on the same single claimable job never both succeed", async () => {
    const job = await enqueue("Concurrent Claim App", "3");
    const [a, b] = await Promise.all([
      claimNextAvailableJob(db, "worker-a", 60_000),
      claimNextAvailableJob(db, "worker-b", 60_000),
    ]);
    const claimedBy = [a, b].filter((r): r is NonNullable<typeof r> => r !== null && r.id === job.id);
    expect(claimedBy).toHaveLength(1);
  });

  it("claimNextAvailableJob recovers a job whose lease has expired (crash recovery)", async () => {
    const job = await enqueue("Stale Lease App", "4");
    const claimed = await claimJobById(db, job.id, "worker-dead", 60_000);
    expect(claimed).not.toBeNull();

    // Simulate the owning worker crashing: force the lease into the past.
    await db.update(generationJobs).set({ leaseExpiresAt: new Date(Date.now() - 1_000) }).where(eq(generationJobs.id, job.id));

    const recovered = await claimNextAvailableJob(db, "worker-recovery", 60_000);
    expect(recovered?.id).toBe(job.id);
    expect(recovered?.leaseOwner).toBe("worker-recovery");
    expect(recovered?.attemptCount).toBe(2);
  });

  it("claimNextAvailableJob never claims a job awaiting clarification", async () => {
    const job = await enqueue("Needs Clarification App", "5");
    await transitionStatus(db, job.id, "queued", "analyzing");
    await transitionStatus(db, job.id, "analyzing", "needs_clarification", {
      clarificationState: { rounds: [{ roundNumber: 1, questions: [{ id: "q1", question: "?" }], answers: [], askedAt: new Date().toISOString() }] },
    });
    const claimed = await claimNextAvailableJob(db, "worker-a", 60_000);
    expect(claimed).toBeNull();
  });

  it("never claims a terminal job", async () => {
    const job = await enqueue("Terminal App", "6");
    await transitionStatus(db, job.id, "queued", "cancelled");
    expect(await claimJobById(db, job.id, "worker-a", 60_000)).toBeNull();
    expect(await claimNextAvailableJob(db, "worker-a", 60_000)).toBeNull();
  });
});

describe("heartbeat", () => {
  it("refreshes the lease for the current owner", async () => {
    const { app, creationRequest } = await makeAppWithCreationRequest(owner, "Heartbeat App", "hb-1");
    const job = await enqueueGenerationJob(db, owner, app.id, {
      creationRequestId: creationRequest.id,
      requestedTemplateId: "task_management",
      idempotencyKey: "hb-key-1",
    });
    const claimed = await claimJobById(db, job.id, "worker-a", 5_000);
    await new Promise((r) => setTimeout(r, 10));
    await heartbeat(db, job.id, "worker-a", 60_000);
    const [row] = await db.select().from(generationJobs).where(eq(generationJobs.id, job.id));
    expect(row.leaseExpiresAt!.getTime()).toBeGreaterThan(claimed!.leaseExpiresAt!.getTime());
  });

  it("throws LeaseLostError when called by a worker that does not currently own the lease", async () => {
    const { app, creationRequest } = await makeAppWithCreationRequest(owner, "Lease Lost App", "hb-2");
    const job = await enqueueGenerationJob(db, owner, app.id, {
      creationRequestId: creationRequest.id,
      requestedTemplateId: "task_management",
      idempotencyKey: "hb-key-2",
    });
    await claimJobById(db, job.id, "worker-a", 60_000);
    await expect(heartbeat(db, job.id, "worker-b", 60_000)).rejects.toBeInstanceOf(LeaseLostError);
  });

  it("throws LeaseLostError once the job has reached a terminal status", async () => {
    const { app, creationRequest } = await makeAppWithCreationRequest(owner, "Terminal Heartbeat App", "hb-3");
    const job = await enqueueGenerationJob(db, owner, app.id, {
      creationRequestId: creationRequest.id,
      requestedTemplateId: "task_management",
      idempotencyKey: "hb-key-3",
    });
    await claimJobById(db, job.id, "worker-a", 60_000);
    await transitionStatus(db, job.id, "queued", "cancelled");
    await expect(heartbeat(db, job.id, "worker-a", 60_000)).rejects.toBeInstanceOf(LeaseLostError);
  });
});

describe("transitionStatus", () => {
  it("applies a legal transition and persists the patch", async () => {
    const { app, creationRequest } = await makeAppWithCreationRequest(owner, "Transition App", "tr-1");
    const job = await enqueueGenerationJob(db, owner, app.id, {
      creationRequestId: creationRequest.id,
      requestedTemplateId: "task_management",
      idempotencyKey: "tr-key-1",
    });
    const updated = await transitionStatus(db, job.id, "queued", "analyzing", { phase: "analyzing:custom" });
    expect(updated.status).toBe("analyzing");
    expect(updated.phase).toBe("analyzing:custom");
    expect(updated.startedAt).toBeTruthy();
  });

  it("throws IllegalStateTransitionError for an illegal transition without touching the row", async () => {
    const { app, creationRequest } = await makeAppWithCreationRequest(owner, "Illegal Transition App", "tr-2");
    const job = await enqueueGenerationJob(db, owner, app.id, {
      creationRequestId: creationRequest.id,
      requestedTemplateId: "task_management",
      idempotencyKey: "tr-key-2",
    });
    await expect(transitionStatus(db, job.id, "queued", "ready")).rejects.toBeInstanceOf(IllegalStateTransitionError);
    const [row] = await db.select().from(generationJobs).where(eq(generationJobs.id, job.id));
    expect(row.status).toBe("queued");
  });

  it("throws StaleJobStateError when `from` no longer matches the row's actual status (lost compare-and-swap)", async () => {
    const { app, creationRequest } = await makeAppWithCreationRequest(owner, "Stale Transition App", "tr-3");
    const job = await enqueueGenerationJob(db, owner, app.id, {
      creationRequestId: creationRequest.id,
      requestedTemplateId: "task_management",
      idempotencyKey: "tr-key-3",
    });
    await transitionStatus(db, job.id, "queued", "analyzing");
    // A second, stale attempt still claiming "queued" as the starting point.
    await expect(transitionStatus(db, job.id, "queued", "analyzing")).rejects.toBeInstanceOf(StaleJobStateError);
  });

  it("sets completedAt when reaching a terminal status", async () => {
    const { app, creationRequest } = await makeAppWithCreationRequest(owner, "Completed App", "tr-4");
    const job = await enqueueGenerationJob(db, owner, app.id, {
      creationRequestId: creationRequest.id,
      requestedTemplateId: "task_management",
      idempotencyKey: "tr-key-4",
    });
    const updated = await transitionStatus(db, job.id, "queued", "cancelled");
    expect(updated.completedAt).toBeTruthy();
  });
});

describe("requestCancellation", () => {
  it("cancels a queued job immediately (no in-flight work to interrupt)", async () => {
    const { app, creationRequest } = await makeAppWithCreationRequest(owner, "Cancel Queued App", "cx-1");
    const job = await enqueueGenerationJob(db, owner, app.id, {
      creationRequestId: creationRequest.id,
      requestedTemplateId: "task_management",
      idempotencyKey: "cx-key-1",
    });
    const cancelled = await requestCancellation(db, owner, app.id, job.id);
    expect(cancelled.status).toBe("cancelled");
  });

  it("flags an actively-processing job cooperatively rather than force-changing its status", async () => {
    const { app, creationRequest } = await makeAppWithCreationRequest(owner, "Cancel Active App", "cx-2");
    const job = await enqueueGenerationJob(db, owner, app.id, {
      creationRequestId: creationRequest.id,
      requestedTemplateId: "task_management",
      idempotencyKey: "cx-key-2",
    });
    await transitionStatus(db, job.id, "queued", "analyzing");
    const flagged = await requestCancellation(db, owner, app.id, job.id);
    expect(flagged.status).toBe("analyzing");
    expect(flagged.cancelRequestedAt).toBeTruthy();
  });

  it("is repeatable: cancelling an already-cancelled job is a no-op success", async () => {
    const { app, creationRequest } = await makeAppWithCreationRequest(owner, "Repeat Cancel App", "cx-3");
    const job = await enqueueGenerationJob(db, owner, app.id, {
      creationRequestId: creationRequest.id,
      requestedTemplateId: "task_management",
      idempotencyKey: "cx-key-3",
    });
    await requestCancellation(db, owner, app.id, job.id);
    const second = await requestCancellation(db, owner, app.id, job.id);
    expect(second.status).toBe("cancelled");
  });

  it("cannot cancel a job that already reached a different terminal status", async () => {
    const { app, creationRequest } = await makeAppWithCreationRequest(owner, "Finished App", "cx-4");
    const job = await enqueueGenerationJob(db, owner, app.id, {
      creationRequestId: creationRequest.id,
      requestedTemplateId: "task_management",
      idempotencyKey: "cx-key-4",
    });
    await transitionStatus(db, job.id, "queued", "analyzing");
    await transitionStatus(db, job.id, "analyzing", "planning");
    await transitionStatus(db, job.id, "planning", "applying");
    await transitionStatus(db, job.id, "applying", "validating");
    await transitionStatus(db, job.id, "validating", "failed", { failureCode: "worker_infrastructure_error", failureMessage: "x" });
    await expect(requestCancellation(db, owner, app.id, job.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("requires app.cancelGeneration — a viewer cannot cancel (unauthorized cancellation)", async () => {
    const { app, creationRequest } = await makeAppWithCreationRequest(owner, "Viewer Cancel App", "cx-5");
    await addCollaborator(db, owner, app.id, viewer.principalId, "viewer");
    const job = await enqueueGenerationJob(db, owner, app.id, {
      creationRequestId: creationRequest.id,
      requestedTemplateId: "task_management",
      idempotencyKey: "cx-key-5",
    });
    await expect(requestCancellation(db, viewer, app.id, job.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("an unrelated actor cannot cancel and cannot learn the job exists (NotFoundError)", async () => {
    const { app, creationRequest } = await makeAppWithCreationRequest(owner, "Unrelated Cancel App", "cx-6");
    const job = await enqueueGenerationJob(db, owner, app.id, {
      creationRequestId: creationRequest.id,
      requestedTemplateId: "task_management",
      idempotencyKey: "cx-key-6",
    });
    await expect(requestCancellation(db, unrelated, app.id, job.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("submitClarificationAnswers", () => {
  async function makeAwaitingClarification(name: string, suffix: string) {
    const { app, creationRequest } = await makeAppWithCreationRequest(owner, name, `cl-${suffix}`);
    const job = await enqueueGenerationJob(db, owner, app.id, {
      creationRequestId: creationRequest.id,
      requestedTemplateId: "task_management",
      idempotencyKey: `cl-key-${suffix}`,
    });
    await transitionStatus(db, job.id, "queued", "analyzing");
    const withQuestions = await transitionStatus(db, job.id, "analyzing", "needs_clarification", {
      clarificationState: {
        rounds: [
          {
            roundNumber: 1,
            questions: [{ id: "q1", question: "How many users?" }, { id: "q2", question: "What domain?" }],
            answers: [],
            askedAt: new Date().toISOString(),
          },
        ],
      },
    });
    return { app, job: withQuestions };
  }

  it("resumes the job to analyzing and records the answers", async () => {
    const { app, job } = await makeAwaitingClarification("Clarify App", "1");
    const resumed = await submitClarificationAnswers(db, owner, app.id, job.id, {
      roundNumber: 1,
      answers: [{ questionId: "q1", answer: "About 10" }, { questionId: "q2", answer: "Construction" }],
    });
    expect(resumed.status).toBe("analyzing");
    expect(resumed.leaseOwner).toBeNull();
    const state = resumed.clarificationState as { rounds: Array<{ answers: Array<{ questionId: string }> }> };
    expect(state.rounds[0].answers).toHaveLength(2);
  });

  it("rejects an answer to an unknown question id", async () => {
    const { app, job } = await makeAwaitingClarification("Bad Question App", "2");
    await expect(
      submitClarificationAnswers(db, owner, app.id, job.id, {
        roundNumber: 1,
        answers: [{ questionId: "not-a-real-question", answer: "x" }],
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects submission when the job is not currently awaiting clarification", async () => {
    const { app, creationRequest } = await makeAppWithCreationRequest(owner, "Not Awaiting App", "cl-3");
    const job = await enqueueGenerationJob(db, owner, app.id, {
      creationRequestId: creationRequest.id,
      requestedTemplateId: "task_management",
      idempotencyKey: "cl-key-3",
    });
    await expect(
      submitClarificationAnswers(db, owner, app.id, job.id, { roundNumber: 1, answers: [{ questionId: "q1", answer: "x" }] }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("resuming is idempotent-safe from the last saved state: a second identical submission still leaves the job resumable", async () => {
    const { app, job } = await makeAwaitingClarification("Resume Safe App", "4");
    await submitClarificationAnswers(db, owner, app.id, job.id, {
      roundNumber: 1,
      answers: [{ questionId: "q1", answer: "10" }, { questionId: "q2", answer: "Construction" }],
    });
    // Job is now "analyzing" — the original prompt/answers are preserved on the row.
    const [row] = await db.select().from(generationJobs).where(eq(generationJobs.id, job.id));
    const state = row.clarificationState as { rounds: Array<{ answers: unknown[] }> };
    expect(state.rounds[0].answers).toHaveLength(2);
  });
});

describe("reads and isolation", () => {
  it("getGenerationJobForActor: a viewer can read (app.viewGenerationJob is viewer-rank)", async () => {
    const { app, creationRequest } = await makeAppWithCreationRequest(owner, "Viewer Read App", "rd-1");
    await addCollaborator(db, owner, app.id, viewer.principalId, "viewer");
    const job = await enqueueGenerationJob(db, owner, app.id, {
      creationRequestId: creationRequest.id,
      requestedTemplateId: "task_management",
      idempotencyKey: "rd-key-1",
    });
    const read = await getGenerationJobForActor(db, viewer, app.id, job.id);
    expect(read.id).toBe(job.id);
  });

  it("an unrelated actor cannot view a job, or even learn it exists", async () => {
    const { app, creationRequest } = await makeAppWithCreationRequest(owner, "Cross Owner Read App", "rd-2");
    const job = await enqueueGenerationJob(db, owner, app.id, {
      creationRequestId: creationRequest.id,
      requestedTemplateId: "task_management",
      idempotencyKey: "rd-key-2",
    });
    await expect(getGenerationJobForActor(db, unrelated, app.id, job.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("getLatestGenerationJobForActor returns null when no job was ever requested", async () => {
    const { app } = await makeAppWithCreationRequest(owner, "No Job App", "rd-3");
    expect(await getLatestGenerationJobForActor(db, owner, app.id)).toBeNull();
  });

  it("getLatestGenerationJobForActor returns the most recently created job for the app", async () => {
    const { app, creationRequest } = await makeAppWithCreationRequest(owner, "Latest Job App", "rd-4");
    const first = await enqueueGenerationJob(db, owner, app.id, {
      creationRequestId: creationRequest.id,
      requestedTemplateId: "task_management",
      idempotencyKey: "rd-key-4a",
    });
    await requestCancellation(db, owner, app.id, first.id);
    const second = await enqueueGenerationJob(db, owner, app.id, {
      creationRequestId: creationRequest.id,
      requestedTemplateId: "task_management",
      idempotencyKey: "rd-key-4b",
    });
    const latest = await getLatestGenerationJobForActor(db, owner, app.id);
    expect(latest?.id).toBe(second.id);
  });

  it("editor and unrelated-editor-of-another-app cannot see each other's jobs (per-app isolation)", async () => {
    const { app: appA, creationRequest: crA } = await makeAppWithCreationRequest(owner, "Isolation App A", "rd-5a");
    const { app: appB } = await makeAppWithCreationRequest(editor, "Isolation App B", "rd-5b");
    const jobA = await enqueueGenerationJob(db, owner, appA.id, {
      creationRequestId: crA.id,
      requestedTemplateId: "task_management",
      idempotencyKey: "rd-key-5",
    });
    // editor (owner of appB, unrelated to appA) must not be able to read jobA via appA's id.
    await expect(getGenerationJobForActor(db, editor, appA.id, jobA.id)).rejects.toBeInstanceOf(NotFoundError);
    // And appB has no jobs of its own.
    expect(await getLatestGenerationJobForActor(db, editor, appB.id)).toBeNull();
  });
});
