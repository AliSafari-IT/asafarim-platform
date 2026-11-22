import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ApplicationEmailConfig } from "./config";
import type { ApplicationMailer, OutgoingEmail, SendOutcome } from "./mailer";
import type { DraftSaveInput } from "./normalize";

/**
 * Sending an application email against a real database
 * (send-application.md): idempotent replays, provider refusal and
 * uncertainty, Saved -> Applied only on acceptance, Interviewing untouched,
 * exactly this application's PDFs, ownership, immutable history, the
 * reconcile pass and the sent-list filters. Guarded behind
 * `RESUMATCH_TEST_DATABASE_URL`; `pnpm test` never touches a database.
 *
 *   RESUMATCH_TEST_DATABASE_URL=postgresql://... \
 *     pnpm --filter @asafarim/resumatch exec vitest run --config vitest.integration.config.ts lib/applicationEmail/service.integration.test.ts
 */

const TEST_DB = process.env.RESUMATCH_TEST_DATABASE_URL;
if (TEST_DB) process.env.RESUMATCH_DATABASE_URL = TEST_DB;

// PDF bytes live in object storage; an in-memory map stands in for it.
const objects = vi.hoisted(() => new Map<string, Uint8Array>());
vi.mock("../documents/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../documents/storage")>();
  return {
    ...actual,
    putDocumentBytes: async (key: string, bytes: Uint8Array) => {
      objects.set(key, new Uint8Array(bytes));
    },
    readDocumentBytes: async (key: string) => {
      const bytes = objects.get(key);
      return bytes ? { bytes, contentType: "application/pdf" } : null;
    },
    deleteDocumentBytes: async (key: string) => {
      objects.delete(key);
      return true;
    },
  };
});

const CONFIG: ApplicationEmailConfig = {
  transport: "fixture",
  unavailableReason: null,
  fromAddress: "applications@resumatch.example.test",
  fromNameSuffix: "via ResuMatch",
  messageIdDomain: "resumatch.example.test",
  dailyLimit: 20,
  timeoutMs: 5_000,
  smtp: null,
};

const CONTEXT = { accountEmail: "candidate@example.test", accountName: "Account Name" };

function recordingMailer(outcome: (email: OutgoingEmail) => SendOutcome = (e) => ({ kind: "accepted", providerMessageId: e.messageId, response: "250 ok" })) {
  const sent: OutgoingEmail[] = [];
  const mailer: ApplicationMailer = {
    name: "fixture",
    async send(email) {
      sent.push(email);
      return outcome(email);
    },
  };
  return { mailer, sent };
}

let counter = 0;
function fakePdf(): Uint8Array {
  counter += 1;
  return new TextEncoder().encode(`%PDF-1.7\n% test ${counter}\n%%EOF`);
}

describe.skipIf(!TEST_DB)("application email: send, history, filters", () => {
  let db: import("../db/generated").PrismaClient;
  let service: typeof import("./service");
  let pdfs: typeof import("../documentPdfs/service");
  let sentList: typeof import("./sentList");
  let sentQuery: typeof import("./sentQuery");
  const workspaceIds: string[] = [];

  async function seed(options: { employer?: string; status?: "SAVED" | "APPLIED" | "INTERVIEWING" | "OFFER"; withLetter?: boolean } = {}) {
    const { createVersion, confirmVersion } = await import("../profile/versions");
    const { buildCoverLetterContent } = await import("../tailoring/ai/coverLetter/schema");
    const ws = await db.workspace.create({ data: { platformUserId: `send-test-${randomUUID()}` }, select: { id: true } });
    workspaceIds.push(ws.id);
    const version = await createVersion({
      workspaceId: ws.id,
      content: { fullName: "Robin Example", headline: "Engineer", skills: [{ name: "TypeScript", rawLabel: null, yearsExperience: 5 }] },
      origin: "MANUAL",
      extractorName: "test",
      extractorVersion: "1",
    });
    await confirmVersion(ws.id, version.id);
    const job = await db.targetJob.create({
      data: {
        workspaceId: ws.id,
        sourceUrl: "https://example.test/jobs/1",
        rawText: "We need a TypeScript engineer. Apply to jobs@acme.example.test",
        title: "Backend Engineer",
        employer: options.employer ?? "Acme B.V.",
        status: "FETCHED",
      },
      select: { id: true },
    });
    const resume = await db.tailoredResume.create({
      data: {
        workspaceId: ws.id,
        profileVersionId: version.id,
        targetJobId: job.id,
        content: { fullName: "Robin Example", skills: ["TypeScript"], experience: [], education: [], certifications: [] },
        templateKey: "classic",
        promptVersion: "tailor_resume@2",
        modelVersion: "fixture-tailor-1",
      },
      select: { id: true },
    });
    let letterId: string | null = null;
    if (options.withLetter !== false) {
      const letter = await db.coverLetter.create({
        data: {
          workspaceId: ws.id,
          profileVersionId: version.id,
          targetJobId: job.id,
          tailoredResumeId: resume.id,
          content: buildCoverLetterContent({ greeting: "Dear team,", paragraphs: ["I build TypeScript services."], signOff: "Kind regards," }, "Robin Example"),
          promptVersion: "cover_letter@1",
          modelVersion: "fixture",
          outputLanguage: "en",
        },
        select: { id: true },
      });
      letterId = letter.id;
    }
    const application = await db.application.create({
      data: { workspaceId: ws.id, targetJobId: job.id, tailoredResumeId: resume.id, status: options.status ?? "SAVED" },
      select: { id: true },
    });
    let cvPdfId: string | null = null;
    let letterPdfId: string | null = null;
    if (letterId) {
      const made = await pdfs.createPdfs(ws.id, resume.id, null, async () => fakePdf());
      expect(made.ok).toBe(true);
      if (made.ok) {
        cvPdfId = made.status.cv.latest!.id;
        letterPdfId = made.status.letter!.latest!.id;
      }
    }
    return { workspaceId: ws.id, applicationId: application.id, tailoredResumeId: resume.id, letterId, cvPdfId, letterPdfId, jobId: job.id };
  }

  function draftFor(s: { cvPdfId: string | null; letterPdfId: string | null }, overrides: Partial<DraftSaveInput> = {}): DraftSaveInput {
    return {
      toEmail: "Jobs@Acme.Example.Test",
      contactName: "Sam Recruiter",
      subject: "Application: Backend Engineer",
      body: "Dear Sam,\n\nPlease find my CV and letter attached.\n\nKind regards,\nRobin Example",
      subjectEdited: false,
      bodyEdited: true,
      sendCopyToSelf: true,
      cvPdfId: s.cvPdfId,
      coverLetterPdfId: s.letterPdfId,
      version: null,
      ...overrides,
    };
  }

  async function currentVersion(applicationId: string): Promise<number | null> {
    const row = await db.applicationEmailDraft.findUnique({ where: { applicationId }, select: { version: true } });
    return row?.version ?? null;
  }

  const noRetry = () => {};

  beforeAll(async () => {
    service = await import("./service");
    pdfs = await import("../documentPdfs/service");
    sentList = await import("./sentList");
    sentQuery = await import("./sentQuery");
    db = (await import("../db/client")).getJobmatchDb();
  });

  afterAll(async () => {
    if (!db || workspaceIds.length === 0) return;
    // History rows are immutable by design; tests clean up with the
    // triggers' own escape hatch: dropping the workspace cascades.
    await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
  });

  it("sends once, moves Saved to Applied with a timestamp, and stores a snapshot", async () => {
    const s = await seed();
    const { mailer, sent } = recordingMailer();
    const now = new Date("2026-11-21T10:00:00Z");
    const result = await service.sendApplicationEmail(
      s.workspaceId,
      s.applicationId,
      { draft: draftFor(s), idempotencyKey: randomUUID() },
      CONTEXT,
      { config: CONFIG, mailer, now: () => now, scheduleRetry: noRetry },
    );
    expect(result).toMatchObject({ outcome: "accepted", applicationStatus: "APPLIED", recorded: true, replayed: false });
    expect(sent).toHaveLength(1);
    const email = sent[0]!;
    expect(email.from).toEqual({ name: "Robin Example via ResuMatch", address: CONFIG.fromAddress });
    expect(email.replyTo).toBe(CONTEXT.accountEmail);
    expect(email.bcc).toBe(CONTEXT.accountEmail);
    expect(email.attachments.map((a) => a.filename)).toHaveLength(2);

    const app = await db.application.findUniqueOrThrow({ where: { id: s.applicationId } });
    expect(app.status).toBe("APPLIED");
    expect(app.appliedAt).toEqual(now);

    const row = await db.sentApplicationEmail.findUniqueOrThrow({
      where: { id: result.outcome === "accepted" ? result.sentId : "" },
      include: { attachments: true },
    });
    expect(row).toMatchObject({
      status: "ACCEPTED",
      companyKey: "acme",
      companyName: "Acme B.V.",
      contactEmail: "Jobs@Acme.Example.Test",
      contactEmailNormalized: "jobs@acme.example.test",
      statusTransition: "SAVED->APPLIED",
      sentAt: now,
      appliedAt: now,
    });
    expect(row.attachments.map((a) => a.documentPdfId).sort()).toEqual([s.cvPdfId, s.letterPdfId].sort());
  });

  it("replays the same key without sending again", async () => {
    const s = await seed();
    const { mailer, sent } = recordingMailer();
    const request = { draft: draftFor(s), idempotencyKey: randomUUID() };
    const first = await service.sendApplicationEmail(s.workspaceId, s.applicationId, request, CONTEXT, { config: CONFIG, mailer, scheduleRetry: noRetry });
    const second = await service.sendApplicationEmail(
      s.workspaceId,
      s.applicationId,
      { ...request, draft: { ...request.draft, version: await currentVersion(s.applicationId) } },
      CONTEXT,
      { config: CONFIG, mailer, scheduleRetry: noRetry },
    );
    expect(first.outcome).toBe("accepted");
    expect(second).toMatchObject({ outcome: "accepted", replayed: true });
    expect(first.outcome === "accepted" && second.outcome === "accepted" && first.sentId === second.sentId).toBe(true);
    expect(sent).toHaveLength(1);
    expect(await db.sentApplicationEmail.count({ where: { applicationId: s.applicationId } })).toBe(1);
  });

  it("two concurrent requests with the same key send one email", async () => {
    const s = await seed();
    const { mailer, sent } = recordingMailer();
    const request = { draft: draftFor(s), idempotencyKey: randomUUID() };
    const results = await Promise.all([
      service.sendApplicationEmail(s.workspaceId, s.applicationId, request, CONTEXT, { config: CONFIG, mailer, scheduleRetry: noRetry }),
      service.sendApplicationEmail(s.workspaceId, s.applicationId, request, CONTEXT, { config: CONFIG, mailer, scheduleRetry: noRetry }),
    ]);
    expect(sent.length).toBe(1);
    expect(await db.sentApplicationEmail.count({ where: { applicationId: s.applicationId } })).toBe(1);
    // The loser either replays the row or reports a draft conflict; neither sends.
    for (const r of results) expect(["accepted", "in_progress", "invalid"]).toContain(r.outcome);
  });

  it("a provider refusal keeps the status and the draft", async () => {
    const s = await seed();
    const { mailer } = recordingMailer(() => ({ kind: "rejected", code: "SMTP_550", response: "550 no such user" }));
    const result = await service.sendApplicationEmail(
      s.workspaceId,
      s.applicationId,
      { draft: draftFor(s, { body: "My edited text" }), idempotencyKey: randomUUID() },
      CONTEXT,
      { config: CONFIG, mailer, scheduleRetry: noRetry },
    );
    expect(result).toMatchObject({ outcome: "failed", errorCode: "SMTP_550" });
    const app = await db.application.findUniqueOrThrow({ where: { id: s.applicationId } });
    expect(app).toMatchObject({ status: "SAVED", appliedAt: null });
    const draft = await db.applicationEmailDraft.findUniqueOrThrow({ where: { applicationId: s.applicationId } });
    expect(draft.body).toBe("My edited text");

    // After a refusal, a new attempt (new key) is allowed and sends.
    const ok = recordingMailer();
    const retry = await service.sendApplicationEmail(
      s.workspaceId,
      s.applicationId,
      { draft: draftFor(s, { version: draft.version }), idempotencyKey: randomUUID() },
      CONTEXT,
      { config: CONFIG, mailer: ok.mailer, scheduleRetry: noRetry },
    );
    expect(retry.outcome).toBe("accepted");
    expect(ok.sent).toHaveLength(1);
  });

  it("an uncertain send never moves the status and blocks a resend until confirmed", async () => {
    const s = await seed();
    const { mailer } = recordingMailer(() => ({ kind: "uncertain", code: "ETIMEDOUT" }));
    const result = await service.sendApplicationEmail(
      s.workspaceId,
      s.applicationId,
      { draft: draftFor(s), idempotencyKey: randomUUID() },
      CONTEXT,
      { config: CONFIG, mailer, scheduleRetry: noRetry },
    );
    expect(result.outcome).toBe("uncertain");
    expect((await db.application.findUniqueOrThrow({ where: { id: s.applicationId } })).status).toBe("SAVED");

    const ok = recordingMailer();
    const version = await currentVersion(s.applicationId);
    const blocked = await service.sendApplicationEmail(
      s.workspaceId,
      s.applicationId,
      { draft: draftFor(s, { version }), idempotencyKey: randomUUID() },
      CONTEXT,
      { config: CONFIG, mailer: ok.mailer, scheduleRetry: noRetry },
    );
    expect(blocked).toMatchObject({ outcome: "invalid", reason: "unresolved_send" });
    expect(ok.sent).toHaveLength(0);

    const confirmed = await service.sendApplicationEmail(
      s.workspaceId,
      s.applicationId,
      { draft: draftFor(s, { version: await currentVersion(s.applicationId) }), idempotencyKey: randomUUID(), confirmResend: true },
      CONTEXT,
      { config: CONFIG, mailer: ok.mailer, scheduleRetry: noRetry },
    );
    expect(confirmed.outcome).toBe("accepted");
    expect(ok.sent).toHaveLength(1);
  });

  it("a mailer that throws is recorded as uncertain, not failed", async () => {
    const s = await seed();
    const mailer: ApplicationMailer = {
      name: "fixture",
      async send() {
        throw new Error("socket hang up");
      },
    };
    const result = await service.sendApplicationEmail(
      s.workspaceId,
      s.applicationId,
      { draft: draftFor(s), idempotencyKey: randomUUID() },
      CONTEXT,
      { config: CONFIG, mailer, scheduleRetry: noRetry },
    );
    expect(result.outcome).toBe("uncertain");
    const row = await db.sentApplicationEmail.findFirstOrThrow({ where: { applicationId: s.applicationId } });
    expect(row).toMatchObject({ status: "UNCERTAIN", errorCode: "MAILER_THREW" });
  });

  it("never moves Interviewing or Offer, and keeps an earlier appliedAt", async () => {
    for (const status of ["INTERVIEWING", "OFFER", "APPLIED"] as const) {
      const s = await seed({ status });
      const earlier = new Date("2026-10-01T09:00:00Z");
      await db.application.update({ where: { id: s.applicationId }, data: { appliedAt: earlier } });
      const { mailer } = recordingMailer();
      const result = await service.sendApplicationEmail(
        s.workspaceId,
        s.applicationId,
        { draft: draftFor(s), idempotencyKey: randomUUID() },
        CONTEXT,
        { config: CONFIG, mailer, scheduleRetry: noRetry },
      );
      expect(result).toMatchObject({ outcome: "accepted", applicationStatus: status });
      const app = await db.application.findUniqueOrThrow({ where: { id: s.applicationId } });
      expect(app.status).toBe(status);
      expect(app.appliedAt).toEqual(earlier);
    }
  });

  it("refuses another application's PDFs, another workspace's PDFs, and a missing letter", async () => {
    const mine = await seed();
    const other = await seed({ employer: "Other Co" });
    const { mailer, sent } = recordingMailer();

    const crossApp = await service.saveDraft(mine.workspaceId, mine.applicationId, draftFor({ cvPdfId: other.cvPdfId, letterPdfId: mine.letterPdfId }));
    expect(crossApp).toMatchObject({ ok: false, reason: "attachment_mismatch" });

    const swapped = await service.sendApplicationEmail(
      mine.workspaceId,
      mine.applicationId,
      { draft: draftFor({ cvPdfId: mine.letterPdfId, letterPdfId: mine.cvPdfId }), idempotencyKey: randomUUID() },
      CONTEXT,
      { config: CONFIG, mailer, scheduleRetry: noRetry },
    );
    expect(swapped).toMatchObject({ outcome: "invalid", reason: "attachments" });

    const noLetter = await seed({ withLetter: false });
    const missing = await service.sendApplicationEmail(
      noLetter.workspaceId,
      noLetter.applicationId,
      { draft: draftFor({ cvPdfId: null, letterPdfId: null }), idempotencyKey: randomUUID() },
      CONTEXT,
      { config: CONFIG, mailer, scheduleRetry: noRetry },
    );
    expect(missing).toMatchObject({ outcome: "invalid", reason: "attachments" });
    expect(sent).toHaveLength(0);
  });

  it("refuses a PDF whose stored bytes no longer match their hash", async () => {
    const s = await seed();
    const pdf = await db.documentPdf.findUniqueOrThrow({ where: { id: s.cvPdfId! } });
    objects.set(pdf.storageKey, fakePdf());
    const { mailer, sent } = recordingMailer();
    const result = await service.sendApplicationEmail(
      s.workspaceId,
      s.applicationId,
      { draft: draftFor(s), idempotencyKey: randomUUID() },
      CONTEXT,
      { config: CONFIG, mailer, scheduleRetry: noRetry },
    );
    expect(result).toMatchObject({ outcome: "invalid", reason: "attachment_unreadable" });
    expect(sent).toHaveLength(0);
  });

  it("enforces ownership on send, drafts, composer, PDFs and sent history", async () => {
    const mine = await seed();
    const theirs = await seed();
    const { mailer, sent } = recordingMailer();
    const sentMine = await service.sendApplicationEmail(
      mine.workspaceId,
      mine.applicationId,
      { draft: draftFor(mine), idempotencyKey: randomUUID() },
      CONTEXT,
      { config: CONFIG, mailer, scheduleRetry: noRetry },
    );
    expect(sentMine.outcome).toBe("accepted");
    const sentId = sentMine.outcome === "accepted" ? sentMine.sentId : "";

    const viaOther = await service.sendApplicationEmail(
      theirs.workspaceId,
      mine.applicationId,
      { draft: draftFor(mine), idempotencyKey: randomUUID() },
      CONTEXT,
      { config: CONFIG, mailer, scheduleRetry: noRetry },
    );
    expect(viaOther).toMatchObject({ outcome: "invalid", reason: "not_found" });
    expect(sent).toHaveLength(1);
    expect(await service.saveDraft(theirs.workspaceId, mine.applicationId, draftFor(mine))).toMatchObject({ ok: false, reason: "not_found" });
    expect(await service.loadComposer(theirs.workspaceId, mine.applicationId)).toBeNull();
    expect(await pdfs.readPdfBytes(theirs.workspaceId, mine.cvPdfId!)).toMatchObject({ ok: false, reason: "not_found" });
    // Their own application, my PDFs: refused as a mismatch.
    expect(await service.saveDraft(theirs.workspaceId, theirs.applicationId, draftFor(mine))).toMatchObject({ ok: false, reason: "attachment_mismatch" });
    expect(await sentList.getSentEmail(theirs.workspaceId, sentId)).toBeNull();
    const listed = await sentList.listSentEmails(theirs.workspaceId, sentQuery.DEFAULT_SENT_QUERY);
    expect(listed.rows.map((r) => r.id)).not.toContain(sentId);
  });

  it("refuses to send without a configured sender, a reply address or valid fields, keeping the draft", async () => {
    const s = await seed();
    const { mailer, sent } = recordingMailer();
    const off = await service.sendApplicationEmail(
      s.workspaceId,
      s.applicationId,
      { draft: draftFor(s), idempotencyKey: randomUUID() },
      CONTEXT,
      { config: { ...CONFIG, unavailableReason: "disabled" }, mailer: null, scheduleRetry: noRetry },
    );
    expect(off).toMatchObject({ outcome: "invalid", reason: "not_configured" });
    expect(await db.applicationEmailDraft.count({ where: { applicationId: s.applicationId } })).toBe(1);

    const bad = await service.sendApplicationEmail(
      s.workspaceId,
      s.applicationId,
      { draft: draftFor(s, { toEmail: "not an address", subject: "", version: await currentVersion(s.applicationId) }), idempotencyKey: randomUUID() },
      CONTEXT,
      { config: CONFIG, mailer, scheduleRetry: noRetry },
    );
    expect(bad).toMatchObject({ outcome: "invalid", reason: "fields" });
    if (bad.outcome === "invalid") expect(Object.keys(bad.fields ?? {}).sort()).toEqual(["subject", "toEmail"]);

    const noReply = await service.sendApplicationEmail(
      s.workspaceId,
      s.applicationId,
      { draft: draftFor(s, { version: await currentVersion(s.applicationId) }), idempotencyKey: randomUUID() },
      { accountEmail: null, accountName: null },
      { config: CONFIG, mailer, scheduleRetry: noRetry },
    );
    expect(noReply).toMatchObject({ outcome: "invalid", reason: "no_reply_address" });
    expect(sent).toHaveLength(0);
    expect(await db.sentApplicationEmail.count({ where: { applicationId: s.applicationId } })).toBe(0);
  });

  it("applies the daily limit", async () => {
    const s = await seed();
    const { mailer } = recordingMailer();
    const result = await service.sendApplicationEmail(
      s.workspaceId,
      s.applicationId,
      { draft: draftFor(s), idempotencyKey: randomUUID() },
      CONTEXT,
      { config: { ...CONFIG, dailyLimit: 0 }, mailer, scheduleRetry: noRetry },
    );
    expect(result).toMatchObject({ outcome: "invalid", reason: "rate_limited" });
  });

  it("detects a draft edited in another tab", async () => {
    const s = await seed();
    const first = await service.saveDraft(s.workspaceId, s.applicationId, draftFor(s, { body: "tab one" }));
    expect(first.ok).toBe(true);
    const version = first.ok ? first.draft.version : 0;
    const second = await service.saveDraft(s.workspaceId, s.applicationId, draftFor(s, { body: "tab two", version }));
    expect(second.ok).toBe(true);
    const stale = await service.saveDraft(s.workspaceId, s.applicationId, draftFor(s, { body: "tab one again", version }));
    expect(stale).toMatchObject({ ok: false, reason: "conflict" });
    if (!stale.ok) expect(stale.current?.body).toBe("tab two");
    const again = await service.saveDraft(s.workspaceId, s.applicationId, draftFor(s, { body: "new", version: null }));
    expect(again).toMatchObject({ ok: false, reason: "conflict" });
  });

  it("keeps the per-email contact choice (#940) with the draft", async () => {
    const s = await seed();
    const fresh = await service.loadComposer(s.workspaceId, s.applicationId);
    expect(fresh?.contactDefaults).toBeNull();
    expect(fresh?.emailLanguage).toBe("en");

    const override = { callWindows: [], timeZone: "Europe/Paris", outsideHours: "arrange" as const, unavailable: [], email: true, whatsapp: false };
    const saved = await service.saveDraft(s.workspaceId, s.applicationId, draftFor(s, { contactMode: "OVERRIDE", contactOverride: override }));
    expect(saved).toMatchObject({ ok: true, draft: { contactMode: "OVERRIDE", contactOverride: override } });

    const version = saved.ok ? saved.draft.version : 0;
    const omitted = await service.saveDraft(s.workspaceId, s.applicationId, draftFor(s, { contactMode: "OMIT", version }));
    expect(omitted).toMatchObject({ ok: true, draft: { contactMode: "OMIT", contactOverride: null } });

    const { saveContactPreferences } = await import("../contactPreferences/store");
    await saveContactPreferences(s.workspaceId, override);
    const composer = await service.loadComposer(s.workspaceId, s.applicationId);
    expect(composer?.contactDefaults).toEqual(override);
    expect(composer?.draft?.contactMode).toBe("OMIT");

    // Each draft's own choice is in the data export.
    const { exportWorkspaceData } = await import("../profile/dataRights");
    const exported = await exportWorkspaceData(s.workspaceId);
    expect(exported?.emailDraftContacts).toEqual([expect.objectContaining({ applicationId: s.applicationId, contactMode: "OMIT", contactOverride: null })]);
  });

  it("remembers the contact paragraph only while the body holds it", async () => {
    const s = await seed();
    const body = "Dear Sam,\n\nI am applying.\n\nCall me Monday.\n\nKind regards,\nRobin Example";
    const kept = await service.saveDraft(s.workspaceId, s.applicationId, draftFor(s, { body, bodyEdited: false, contactParagraph: "Call me Monday." }));
    expect(kept).toMatchObject({ ok: true, draft: { contactParagraph: "Call me Monday." } });
    const version = kept.ok ? kept.draft.version : 0;
    const gone = await service.saveDraft(s.workspaceId, s.applicationId, draftFor(s, { body: "Dear Sam,\n\nKind regards,", contactParagraph: "Call me Monday.", version }));
    expect(gone).toMatchObject({ ok: true, draft: { contactParagraph: null } });
  });

  it("recovers when the status change was never recorded after an acceptance", async () => {
    const s = await seed();
    const { mailer } = recordingMailer();
    const retries: (() => Promise<boolean>)[] = [];
    const result = await service.sendApplicationEmail(
      s.workspaceId,
      s.applicationId,
      { draft: draftFor(s), idempotencyKey: randomUUID() },
      CONTEXT,
      { config: CONFIG, mailer, scheduleRetry: (task) => retries.push(task) },
    );
    expect(result.outcome).toBe("accepted");
    const sentId = result.outcome === "accepted" ? result.sentId : "";

    // A crash between the provider's acceptance and the status change
    // leaves an ACCEPTED row with no transition; reconcile finishes it.
    const s2 = await seed();
    const sentAt = new Date("2026-11-20T08:00:00Z");
    const orphan = await db.sentApplicationEmail.create({
      data: {
        workspaceId: s2.workspaceId,
        applicationId: s2.applicationId,
        idempotencyKey: `${s2.workspaceId}:${randomUUID()}`,
        targetJobId: s2.jobId,
        companyKey: "acme",
        companyName: "Acme B.V.",
        jobTitle: "Backend Engineer",
        contactEmail: "jobs@acme.example.test",
        contactEmailNormalized: "jobs@acme.example.test",
        fromAddress: "Robin <applications@resumatch.example.test>",
        replyTo: CONTEXT.accountEmail,
        subject: "Application",
        body: "Hello",
        messageId: `<${randomUUID()}@resumatch.example.test>`,
        status: "SENDING",
        attemptedAt: sentAt,
      },
    });
    await db.sentApplicationEmail.update({ where: { id: orphan.id }, data: { status: "ACCEPTED", sentAt } });
    expect((await db.application.findUniqueOrThrow({ where: { id: s2.applicationId } })).status).toBe("SAVED");

    await service.reconcileSentEmails(s2.workspaceId, new Date("2026-11-20T09:00:00Z"));
    const app = await db.application.findUniqueOrThrow({ where: { id: s2.applicationId } });
    expect(app).toMatchObject({ status: "APPLIED", appliedAt: sentAt });
    const healed = await db.sentApplicationEmail.findUniqueOrThrow({ where: { id: orphan.id } });
    expect(healed.statusTransition).toBe("SAVED->APPLIED");

    // recordAcceptance is idempotent: calling it again changes nothing.
    const again = await service.recordAcceptance(s.workspaceId, sentId, { kind: "accepted", providerMessageId: null, response: null }, new Date());
    expect(again).toMatchObject({ ok: true, status: "APPLIED" });
    expect(retries).toHaveLength(0);
  });

  it("turns a stale SENDING row into UNCERTAIN, never into sent or failed", async () => {
    const s = await seed();
    const attemptedAt = new Date("2026-11-20T08:00:00Z");
    const row = await db.sentApplicationEmail.create({
      data: {
        workspaceId: s.workspaceId,
        applicationId: s.applicationId,
        idempotencyKey: `${s.workspaceId}:${randomUUID()}`,
        targetJobId: s.jobId,
        companyKey: "acme",
        companyName: "Acme B.V.",
        contactEmail: "jobs@acme.example.test",
        contactEmailNormalized: "jobs@acme.example.test",
        fromAddress: "Robin <applications@resumatch.example.test>",
        subject: "Application",
        body: "Hello",
        messageId: `<${randomUUID()}@resumatch.example.test>`,
        status: "SENDING",
        attemptedAt,
      },
    });
    await service.reconcileSentEmails(s.workspaceId, new Date(attemptedAt.getTime() + 60_000));
    expect((await db.sentApplicationEmail.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("SENDING");
    await service.reconcileSentEmails(s.workspaceId, new Date(attemptedAt.getTime() + service.SENDING_STALE_MS + 1));
    expect((await db.sentApplicationEmail.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("UNCERTAIN");
    expect((await db.application.findUniqueOrThrow({ where: { id: s.applicationId } })).status).toBe("SAVED");
  });

  it("keeps the history immutable: content, attachments and PDFs cannot change", async () => {
    const s = await seed();
    const { mailer } = recordingMailer();
    const result = await service.sendApplicationEmail(
      s.workspaceId,
      s.applicationId,
      { draft: draftFor(s), idempotencyKey: randomUUID() },
      CONTEXT,
      { config: CONFIG, mailer, scheduleRetry: noRetry },
    );
    const sentId = result.outcome === "accepted" ? result.sentId : "";
    await expect(db.sentApplicationEmail.update({ where: { id: sentId }, data: { subject: "changed" } })).rejects.toThrow();
    await expect(db.sentApplicationEmail.update({ where: { id: sentId }, data: { body: "changed" } })).rejects.toThrow();
    await expect(db.sentApplicationEmail.update({ where: { id: sentId }, data: { contactEmail: "x@y.test" } })).rejects.toThrow();
    await expect(db.sentApplicationEmail.update({ where: { id: sentId }, data: { status: "SENDING" } })).rejects.toThrow();
    await expect(db.sentApplicationAttachment.updateMany({ where: { sentEmailId: sentId }, data: { filename: "other.pdf" } })).rejects.toThrow();
    await expect(db.documentPdf.update({ where: { id: s.cvPdfId! }, data: { contentHash: "0".repeat(64) } })).rejects.toThrow();
    // Delivery metadata may still update.
    await db.sentApplicationEmail.update({ where: { id: sentId }, data: { deliveryStatus: "delivered", deliveryUpdatedAt: new Date() } });

    // Editing the draft afterwards does not touch the history.
    await service.saveDraft(s.workspaceId, s.applicationId, draftFor(s, { body: "rewritten later", version: await currentVersion(s.applicationId) }));
    const detail = await sentList.getSentEmail(s.workspaceId, sentId);
    expect(detail?.body).toBe(draftFor(s).body);
    expect(detail?.deliveryStatus).toBe("delivered");
  });

  it("a newer PDF does not replace the pinned one", async () => {
    const s = await seed();
    const saved = await service.saveDraft(s.workspaceId, s.applicationId, draftFor(s));
    expect(saved.ok).toBe(true);
    // The CV changes, and a new PDF is made beside the old one.
    await db.tailoredResume.update({ where: { id: s.tailoredResumeId }, data: { skillsParagraph: "Changed after the draft." } });
    const made = await pdfs.createPdfs(s.workspaceId, s.tailoredResumeId, null, async () => fakePdf());
    expect(made.ok && made.created).toEqual(["CV"]);
    const composer = await service.loadComposer(s.workspaceId, s.applicationId);
    expect(composer?.attachments.cv?.pdf.id).toBe(s.cvPdfId);
    expect(composer?.attachments.cv?.current).toBe(false);
    expect(composer?.attachments.cv?.newerAvailable?.id).not.toBe(s.cvPdfId);

    const { mailer, sent } = recordingMailer();
    await service.sendApplicationEmail(
      s.workspaceId,
      s.applicationId,
      { draft: draftFor(s, { version: await currentVersion(s.applicationId) }), idempotencyKey: randomUUID() },
      CONTEXT,
      { config: CONFIG, mailer, scheduleRetry: noRetry },
    );
    const row = await db.sentApplicationEmail.findFirstOrThrow({ where: { applicationId: s.applicationId }, include: { attachments: true } });
    expect(row.attachments.find((a) => a.kind === "CV")?.documentPdfId).toBe(s.cvPdfId);
    expect(sent).toHaveLength(1);
  });

  it("filters the sent list by company, contact (with or without a name) and application, sorted and paged", async () => {
    const s = await seed({ employer: "Acme B.V." });
    const ws = s.workspaceId;
    const base = new Date("2026-11-01T10:00:00Z").getTime();
    const make = (i: number, company: string, email: string, contactName: string | null, applicationId: string | null) =>
      db.sentApplicationEmail.create({
        data: {
          workspaceId: ws,
          applicationId,
          idempotencyKey: `${ws}:${randomUUID()}`,
          targetJobId: s.jobId,
          companyKey: company === "Acme B.V." || company === "ACME" ? "acme" : "globex",
          companyName: company,
          contactName,
          contactEmail: email,
          contactEmailNormalized: email.toLowerCase(),
          fromAddress: "Robin <applications@resumatch.example.test>",
          subject: `Application ${i}`,
          body: "Hello",
          messageId: `<${randomUUID()}@resumatch.example.test>`,
          status: "FAILED",
          attemptedAt: new Date(base + i * 60_000),
        },
      });
    await make(1, "Acme B.V.", "Jobs@Acme.example.test", "Sam", s.applicationId);
    await make(2, "ACME", "jobs@acme.example.test", null, null);
    await make(3, "Globex", "hr@globex.example.test", null, null);
    await make(4, "Acme B.V.", "other@acme.example.test", null, s.applicationId);

    const q = sentQuery.DEFAULT_SENT_QUERY;
    const all = await sentList.listSentEmails(ws, q);
    expect(all.total).toBe(4);
    expect(all.rows.map((r) => r.subject)).toEqual(["Application 4", "Application 3", "Application 2", "Application 1"]);

    const byCompany = await sentList.listSentEmails(ws, { ...q, company: "acme" });
    expect(byCompany.total).toBe(3);
    expect(byCompany.workspaceTotal).toBe(4);

    const byContact = await sentList.listSentEmails(ws, { ...q, contact: "jobs@acme.example.test" });
    expect(byContact.rows.map((r) => r.subject).sort()).toEqual(["Application 1", "Application 2"]);

    const combined = await sentList.listSentEmails(ws, { ...q, company: "acme", contact: "other@acme.example.test", sort: "oldest" });
    expect(combined.rows.map((r) => r.subject)).toEqual(["Application 4"]);

    const byApplication = await sentList.listSentEmails(ws, { ...q, application: s.applicationId, sort: "oldest" });
    expect(byApplication.rows.map((r) => r.subject)).toEqual(["Application 1", "Application 4"]);

    const none = await sentList.listSentEmails(ws, { ...q, company: "initech" });
    expect(none.total).toBe(0);
    expect(none.workspaceTotal).toBe(4);

    const pastEnd = await sentList.listSentEmails(ws, { ...q, page: 99 });
    expect(pastEnd.page).toBe(1);
  });
  it("exports sent emails and erases them with their PDFs", async () => {
    const s = await seed();
    const { mailer } = recordingMailer();
    await service.sendApplicationEmail(
      s.workspaceId,
      s.applicationId,
      { draft: draftFor(s), idempotencyKey: randomUUID() },
      CONTEXT,
      { config: CONFIG, mailer, scheduleRetry: noRetry },
    );
    const { exportWorkspaceData, eraseWorkspaceData } = await import("../profile/dataRights");
    const exported = await exportWorkspaceData(s.workspaceId);
    expect(exported?.sentApplicationEmails).toHaveLength(1);
    expect(exported?.sentApplicationEmails[0]).toMatchObject({ subject: draftFor(s).subject, status: "ACCEPTED" });
    expect(exported?.sentApplicationEmails[0]?.attachments).toHaveLength(2);

    const keys = (await db.documentPdf.findMany({ where: { workspaceId: s.workspaceId }, select: { storageKey: true } })).map((p) => p.storageKey);
    const erased = await eraseWorkspaceData(s.workspaceId);
    expect(erased.objectsFailed).toBe(0);
    expect(await db.sentApplicationEmail.count({ where: { workspaceId: s.workspaceId } })).toBe(0);
    expect(await db.applicationEmailDraft.count({ where: { workspaceId: s.workspaceId } })).toBe(0);
    expect(await db.documentPdf.count({ where: { workspaceId: s.workspaceId } })).toBe(0);
    for (const key of keys) expect(objects.has(key)).toBe(false);
  });

  it("deleting a sent PDF on its own is refused", async () => {
    const s = await seed();
    const { mailer } = recordingMailer();
    await service.sendApplicationEmail(
      s.workspaceId,
      s.applicationId,
      { draft: draftFor(s), idempotencyKey: randomUUID() },
      CONTEXT,
      { config: CONFIG, mailer, scheduleRetry: noRetry },
    );
    await expect(db.documentPdf.delete({ where: { id: s.cvPdfId! } })).rejects.toThrow();
    // Deleting the application keeps its history (applicationId cleared).
    await db.application.delete({ where: { id: s.applicationId } });
    const row = await db.sentApplicationEmail.findFirstOrThrow({ where: { workspaceId: s.workspaceId } });
    expect(row.applicationId).toBeNull();
  });
});
