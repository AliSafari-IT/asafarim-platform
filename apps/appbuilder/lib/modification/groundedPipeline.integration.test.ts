import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  DefaultFakeProvider,
  type AiProvider,
  type GroundedModificationContext,
  type ProposeModificationInput,
  type ProposeModificationResult,
  type ProviderCallOptions,
} from "@asafarim/appbuilder-ai";
import type { ApplicationSpecificationType } from "@asafarim/appbuilder-schema";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../db/testUtils";
import { createApp } from "../repositories/apps";
import { applyOperation } from "../repositories/operations";
import { appendUserMessage } from "../repositories/conversations";
import {
  claimJobById,
  enqueueModificationJob,
  submitClarificationAnswer,
  type ModificationJobRow,
} from "../repositories/modificationJobs";
import { loadConversationMemory } from "../repositories/conversationMemory";
import { conversationMessages, specifications, specificationVersions } from "../db/schema";
import { runModificationJob } from "./pipeline";
import type { SelectionContextType } from "./selectionContext";

/**
 * M13 slice D, end to end: the reported conversation's moments run through
 * the REAL `runModificationJob` against a real database, with the default
 * fake provider (no network). Each one previously came back as "this request
 * is too broad to act on safely"; each one is now grounded before the
 * provider is consulted, and the change actually lands.
 *
 * These complement the pure resolver tests rather than duplicating them: the
 * resolver tests prove the right target is *computed*, these prove it
 * survives the trip through the assembler, the provider boundary, the
 * operation engine, versioning, validation, and memory write-back.
 */

const db = getTestDb();
const owner = { principalId: "grounded-owner", roles: [] };

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

/** The slice A fixture app: a `home` page titled "Home", a matching nav entry, and a non-blue primary colour. */
async function setupTitleApp(suffix: string) {
  const app = await createApp(
    db,
    owner,
    { name: `Grounded App ${suffix}`, slug: `grounded-${suffix}-${Math.random().toString(36).slice(2, 8)}` },
    `grounded-create-${suffix}`,
  );
  let v = 1;
  await applyOperation(db, owner, app.id, {
    operation: { opVersion: "1.0.0", type: "CREATE_PAGE", page: { id: "home", name: "Home", path: "home" } },
    baseVersionNumber: v++,
    idempotencyKey: `${suffix}-page`,
  });
  await applyOperation(db, owner, app.id, {
    operation: {
      opVersion: "1.0.0",
      type: "UPDATE_NAVIGATION",
      navigation: [{ id: "nav_home", label: "Home", targetPageId: "home", order: 0 }],
    },
    baseVersionNumber: v++,
    idempotencyKey: `${suffix}-nav`,
  });
  const { version } = await applyOperation(db, owner, app.id, {
    operation: { opVersion: "1.0.0", type: "UPDATE_BRANDING", patch: { primaryColor: "#111111" } },
    baseVersionNumber: v++,
    idempotencyKey: `${suffix}-branding`,
  });
  return { app, baseVersionNumber: version!.versionNumber };
}

/** Wraps a provider and records exactly what grounded context the pipeline handed it. */
class RecordingProvider implements AiProvider {
  readonly name: string;
  grounded: GroundedModificationContext | null = null;

  constructor(private readonly base: AiProvider) {
    this.name = base.name;
  }
  analyzeRequirements: AiProvider["analyzeRequirements"] = (i, o) => this.base.analyzeRequirements(i, o);
  recommendTemplate: AiProvider["recommendTemplate"] = (i, o) => this.base.recommendTemplate(i, o);
  proposeOperations: AiProvider["proposeOperations"] = (i, o) => this.base.proposeOperations(i, o);
  proposeRepair: AiProvider["proposeRepair"] = (i, o) => this.base.proposeRepair(i, o);

  async proposeModification(
    input: ProposeModificationInput,
    options: ProviderCallOptions,
  ): Promise<ProposeModificationResult> {
    this.grounded = input.groundedContext ?? null;
    return this.base.proposeModification(input, options);
  }
}

async function runRequest(
  appId: string,
  baseVersionNumber: number,
  request: string,
  suffix: string,
  selectionContext: SelectionContextType | null = null,
) {
  const { message } = await appendUserMessage(db, owner, appId, {
    content: request,
    selectionContext,
    baseVersionNumber,
  });
  const job = await enqueueModificationJob(db, owner, appId, {
    conversationId: message.conversationId,
    triggeringMessageId: message.id,
    userRequestText: request,
    selectionContext,
    idempotencyKey: `grounded-job-${suffix}`,
  });
  const claimed = await claimJobById(db, job.id, "grounded-worker", 120_000);
  if (!claimed) throw new Error("expected to claim the freshly-enqueued job");

  const provider = new RecordingProvider(new DefaultFakeProvider());
  const outcome = await runModificationJob(
    { db, provider, workerId: "grounded-worker", leaseDurationMs: 120_000, signal: new AbortController().signal },
    claimed,
  );
  if (outcome.kind !== "yielded") throw new Error(`expected a terminal outcome, got ${outcome.kind}`);
  return { job: outcome.job as ModificationJobRow, grounded: provider.grounded, message };
}

/** Re-claims and re-drives an already-enqueued job — used to resume a job a clarification answer just moved back to `interpreting`. */
async function resumeRequest(jobId: string, suffix: string) {
  const claimed = await claimJobById(db, jobId, "grounded-worker", 120_000);
  if (!claimed) throw new Error("expected to reclaim the resumed job");
  const provider = new RecordingProvider(new DefaultFakeProvider());
  const outcome = await runModificationJob(
    { db, provider, workerId: "grounded-worker", leaseDurationMs: 120_000, signal: new AbortController().signal },
    claimed,
  );
  if (outcome.kind !== "yielded") throw new Error(`expected a terminal outcome resuming ${suffix}, got ${outcome.kind}`);
  return { job: outcome.job as ModificationJobRow, grounded: provider.grounded };
}

async function specAt(appId: string, versionNumber: number): Promise<ApplicationSpecificationType> {
  const [spec] = await db.select().from(specifications).where(eq(specifications.appId, appId)).limit(1);
  const rows = await db.select().from(specificationVersions).where(eq(specificationVersions.specificationId, spec.id));
  return rows.find((row) => row.versionNumber === versionNumber)!.payload as unknown as ApplicationSpecificationType;
}

describe('"replace the title Home to Experiences"', () => {
  it("resolves the unique match and applies the rename instead of asking for details", async () => {
    const { app, baseVersionNumber } = await setupTitleApp("rename");
    const { job, grounded } = await runRequest(
      app.id,
      baseVersionNumber,
      "replace the title Home to Experiences",
      "rename",
    );

    expect(grounded?.resolutionOutcome).toBe("resolved");
    expect(grounded?.resolvedTarget?.targetId).toBe("pages.home.name");

    expect(job.status).toBe("ready");
    expect(job.failureCode).toBeNull();
    const spec = await specAt(app.id, job.resultingVersionNumber!);
    expect(spec.pages.find((p) => p.id === "home")?.name).toBe("Experiences");
  });

  it("persists a safe grounding manifest on the job — the audit trail, not the prompt", async () => {
    const { app, baseVersionNumber } = await setupTitleApp("manifest");
    const { job } = await runRequest(app.id, baseVersionNumber, "replace the title Home to Experiences", "manifest");

    const manifest = job.contextManifest as Record<string, unknown>;
    expect(manifest).toMatchObject({ resolutionOutcome: "resolved", resolvedTargetId: "pages.home.name" });
    expect(manifest.manifest).toMatchObject({ specificationVersionNumber: baseVersionNumber });
    expect(JSON.stringify(manifest)).not.toContain("replace the title Home to Experiences");
  });
});

describe('"change the selected title to blue"', () => {
  it("uses the preview selection, applies the closest representable colour change, and says so plainly", async () => {
    const { app, baseVersionNumber } = await setupTitleApp("selected-blue");
    const { job, grounded } = await runRequest(
      app.id,
      baseVersionNumber,
      "change the selected title to blue",
      "selected-blue",
      { appId: app.id, specificationVersionNumber: baseVersionNumber, pageId: "home", label: "Home" },
    );

    expect(grounded?.resolutionOutcome).toBe("resolved");
    expect(grounded?.resolvedTarget?.targetId).toBe("pages.home.name");
    expect(grounded?.previewEvidence).toMatchObject({ kind: "spec_target" });
    expect(grounded?.targetCandidates.map((c) => c.targetId)).toContain("branding.primaryColor");

    expect(job.status).toBe("ready");
    const spec = await specAt(app.id, job.resultingVersionNumber!);
    expect(spec.branding.primaryColor).toBe("#2563eb");
  });
});

describe("memory across turns", () => {
  it('binds the phrases a successful change used, so a later "it is still black" resolves', async () => {
    const { app, baseVersionNumber } = await setupTitleApp("memory");
    const first = await runRequest(app.id, baseVersionNumber, "replace the title Home to Experiences", "memory-1");
    expect(first.job.status).toBe("ready");

    const memory = await loadConversationMemory(db, first.job.conversationId);
    expect(memory?.facts.references.map((r) => r.targetId)).toContain("pages.home.name");
    // Recorded AFTER the apply, so the stored value is the post-change one —
    // otherwise our own edit would immediately invalidate the reference.
    expect(memory?.facts.references[0].recordedValue).toBe("Experiences");
    expect(memory?.facts.references[0].sourceMessageIds).toEqual([first.message.id]);

    const second = await runRequest(app.id, first.job.resultingVersionNumber!, "it is still black", "memory-2");
    expect(second.grounded?.resolutionOutcome).toBe("resolved");
    expect(second.grounded?.resolvedTarget?.targetId).toBe("pages.home.name");
    expect(second.grounded?.memory.map((f) => f.targetId)).toContain("pages.home.name");
    expect(second.job.status).toBe("ready");
    const spec = await specAt(app.id, second.job.resultingVersionNumber!);
    expect(spec.branding.primaryColor).toBe("#111111");
  });
});

describe("duplicate matches (M13 slice E: resumable clarification)", () => {
  it("pauses with one grounded question naming the real competitors, and applies nothing yet", async () => {
    const { app, baseVersionNumber } = await setupTitleApp("duplicate");
    const { version } = await applyOperation(db, owner, app.id, {
      operation: {
        opVersion: "1.0.0",
        type: "CREATE_PAGE",
        page: { id: "home_marketing", name: "Home", path: "marketing-home" },
      },
      baseVersionNumber,
      idempotencyKey: "duplicate-second-home",
    });

    const { job, grounded } = await runRequest(
      app.id,
      version!.versionNumber,
      "the title whose value is Home, make it blue",
      "duplicate",
    );

    expect(grounded?.resolutionOutcome).toBe("ambiguous");
    expect(grounded?.groundedQuestion).toBeTruthy();

    // Slice E: clarification PAUSES the job — it is never a failure, and
    // the question names the actual competing pages, never "too broad".
    expect(job.status).toBe("needs_clarification");
    expect(job.failureCode).toBeNull();

    const state = job.clarificationState as { rounds: { roundNumber: number; question: { text: string; choices: { id: string; targetId?: string }[] } }[] };
    expect(state.rounds).toHaveLength(1);
    expect(state.rounds[0].roundNumber).toBe(1);
    expect(state.rounds[0].question.text).toContain("Home");
    expect(state.rounds[0].question.text).not.toMatch(/too broad/i);
    expect(state.rounds[0].question.choices.length).toBeGreaterThanOrEqual(2);
    expect(state.rounds[0].question.choices.map((c) => c.targetId)).toEqual(
      expect.arrayContaining(["pages.home.name", "pages.home_marketing.name"]),
    );

    const [spec] = await db.select().from(specifications).where(eq(specifications.appId, app.id));
    expect(spec.currentVersionNumber).toBe(version!.versionNumber); // nothing applied yet
  });

  it("resumes with the answer's chosen target and applies the change to exactly that page", async () => {
    const { app, baseVersionNumber } = await setupTitleApp("duplicate-resume");
    const { version } = await applyOperation(db, owner, app.id, {
      operation: { opVersion: "1.0.0", type: "CREATE_PAGE", page: { id: "home_marketing", name: "Home", path: "marketing-home" } },
      baseVersionNumber,
      idempotencyKey: "duplicate-resume-second-home",
    });

    const { job: paused } = await runRequest(app.id, version!.versionNumber, "replace the title Home to Experiences", "duplicate-resume");
    expect(paused.status).toBe("needs_clarification");
    const state = paused.clarificationState as { rounds: { question: { id: string; choices: { id: string; label: string; targetId?: string }[] } }[] };
    const question = state.rounds[0].question;
    const marketingChoice = question.choices.find((c) => c.targetId === "pages.home_marketing.name");
    expect(marketingChoice).toBeDefined();

    const answered = await submitClarificationAnswer(db, owner, app.id, paused.id, {
      questionId: question.id,
      choiceId: marketingChoice!.id,
    });
    expect(answered.status).toBe("interpreting");
    expect(answered.leaseOwner).toBeNull();

    const { job: resumed, grounded: resumedContext } = await resumeRequest(paused.id, "duplicate-resume");

    // The human's choice — not the deterministic text resolver — decided the target.
    expect(resumedContext?.resolvedTarget?.targetId).toBe("pages.home_marketing.name");
    expect(resumed.status).toBe("ready");

    const spec = await specAt(app.id, resumed.resultingVersionNumber!);
    expect(spec.pages.find((p) => p.id === "home_marketing")?.name).toBe("Experiences");
    expect(spec.pages.find((p) => p.id === "home")?.name).toBe("Home"); // the OTHER match was left untouched

    // The answer is also visible in the conversation log.
    const answerMessage = await db
      .select()
      .from(conversationMessages)
      .where(and(eq(conversationMessages.modificationJobId, paused.id), eq(conversationMessages.messageType, "clarification_answer")));
    expect(answerMessage).toHaveLength(1);
    expect(answerMessage[0].content).toBe(marketingChoice!.label);
  });

  it("asks a second (and final) round when a free-text answer does not resolve the ambiguity, honoring the two-round cap", async () => {
    const { app, baseVersionNumber } = await setupTitleApp("duplicate-freetext");
    const { version } = await applyOperation(db, owner, app.id, {
      operation: { opVersion: "1.0.0", type: "CREATE_PAGE", page: { id: "home_marketing", name: "Home", path: "marketing-home" } },
      baseVersionNumber,
      idempotencyKey: "duplicate-freetext-second-home",
    });

    const { job: paused } = await runRequest(app.id, version!.versionNumber, "replace the title Home to Experiences", "duplicate-freetext");
    const state1 = paused.clarificationState as { rounds: { question: { id: string } }[] };

    await submitClarificationAnswer(db, owner, app.id, paused.id, {
      questionId: state1.rounds[0].question.id,
      freeText: "the one used for marketing",
    });
    const { job: secondRound } = await resumeRequest(paused.id, "duplicate-freetext-round2");

    // The deterministic resolver still sees the same unresolved original
    // request text (prose understanding is a real provider's job, not the
    // fixture's) — a second, final round is the honest, safe outcome, not
    // a silent guess or a lost intent.
    expect(secondRound.status).toBe("needs_clarification");
    const state2 = secondRound.clarificationState as { rounds: unknown[] };
    expect(state2.rounds).toHaveLength(2);
  });
});

describe("safety invariants still hold with grounded context", () => {
  it("never lets preview DOM evidence become a mutation target", async () => {
    const { app, baseVersionNumber } = await setupTitleApp("chrome");
    const { job, grounded } = await runRequest(app.id, baseVersionNumber, "make this blue", "chrome", {
      appId: app.id,
      specificationVersionNumber: baseVersionNumber,
      previewEvidence: { domTagName: "header", domTextSnippet: "AppBuilder", domOutsideSpecRegion: true },
    });

    expect(grounded?.previewEvidence).toMatchObject({ kind: "builder_chrome" });
    // The projection carries no selector, tag name, or DOM text onward.
    expect(JSON.stringify(grounded?.previewEvidence)).not.toContain("header");
    // Whatever the outcome, nothing was addressed by a selector: every
    // candidate is a stable specification target.
    for (const candidate of grounded?.targetCandidates ?? []) {
      expect(candidate.targetId).toMatch(/^(app|branding|pages|navigation|entities|dashboard|actions)\./);
    }
    expect(["ready", "failed", "needs_clarification"]).toContain(job.status);
  });
});
