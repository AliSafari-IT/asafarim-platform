import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_APPLICATION_LIST_QUERY } from "../listQuery";
import { createEventSchema, editSubmissionSchema, recordSubmissionSchema } from "./contract";

/**
 * External submissions and the timeline against a real database
 * (application-timeline.md): status semantics, duplicate saves, undo,
 * list counts/filters/sorting and workspace isolation. Guarded behind
 * RESUMATCH_TEST_DATABASE_URL; files go to a throwaway local store and the
 * dev "accept all" scanner.
 *
 *   RESUMATCH_TEST_DATABASE_URL=postgresql://... \
 *     pnpm exec vitest run --config vitest.integration.config.ts lib/applications/timeline/service.integration.test.ts
 */

const TEST_DB = process.env.RESUMATCH_TEST_DATABASE_URL;
if (TEST_DB) {
  process.env.RESUMATCH_DATABASE_URL = TEST_DB;
  process.env.RESUMATCH_SCANNER = "insecure-accept-all";
  process.env.STORAGE_LOCAL_DIR = mkdtempSync(path.join(tmpdir(), "rm-timeline-"));
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const EML = new TextEncoder().encode("From: jobs@example.com\r\nSubject: Application received\r\nDate: Fri, 20 Nov 2026 14:31:00 +0100\r\n\r\nThanks, we got it.");
const key = () => crypto.randomUUID();
const parse = <T,>(schema: { parse: (v: unknown) => T }, v: unknown) => schema.parse(v);

describe.skipIf(!TEST_DB)("timeline service", () => {
  let db: import("../../db/generated").PrismaClient;
  let svc: typeof import("./service");
  let list: typeof import("../service");
  const workspaceIds: string[] = [];

  async function seed(status: "SAVED" | "APPLIED" | "INTERVIEWING" = "SAVED") {
    const ws = await db.workspace.create({ data: { platformUserId: `timeline-test-${Date.now()}-${Math.random()}` }, select: { id: true } });
    workspaceIds.push(ws.id);
    const job = await db.targetJob.create({
      data: { workspaceId: ws.id, sourceUrl: "https://www.indeed.com/viewjob?jk=1", title: "Data Engineer", employer: "Acme", status: "FETCHED" },
      select: { id: true },
    });
    const app = await db.application.create({ data: { workspaceId: ws.id, targetJobId: job.id, status, appliedAt: status === "SAVED" ? null : new Date("2026-11-01T10:00:00Z") } });
    return { workspaceId: ws.id, applicationId: app.id, targetJobId: job.id };
  }

  const record = (extra: Record<string, unknown> = {}) =>
    parse(recordSubmissionSchema(), {
      clientKey: key(),
      appliedAt: { local: "2026-11-20T14:30", timeZone: "Europe/Brussels" },
      channel: "INDEED",
      ...extra,
    });

  beforeAll(async () => {
    svc = await import("./service");
    list = await import("../service");
    db = (await import("../../db/client")).getJobmatchDb();
  });

  afterAll(async () => {
    if (!db || workspaceIds.length === 0) return;
    await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
  });

  it("records an Indeed application without email or PDFs: Saved -> Applied, the past time kept with its zone", async () => {
    const s = await seed();
    const result = await svc.recordExternalSubmission(s.workspaceId, s.applicationId, record({ reference: "IND-42" }));
    expect(result).toEqual({ ok: true, replay: false });

    const app = await db.application.findUniqueOrThrow({ where: { id: s.applicationId } });
    expect(app.status).toBe("APPLIED");
    expect(app.appliedAt?.toISOString()).toBe("2026-11-20T13:30:00.000Z");
    expect(app.appliedTimeZone).toBe("Europe/Brussels");
    expect(app.submissionChannel).toBe("INDEED");
    expect(app.submissionReference).toBe("IND-42");
    expect(app.submissionRecordedAt).not.toBeNull();
    expect(app.submissionRecordedAt!.getTime()).not.toBe(app.appliedAt!.getTime());
    expect(await db.sentApplicationEmail.count({ where: { applicationId: s.applicationId } })).toBe(0);

    const timeline = await svc.loadTimeline(s.workspaceId, s.applicationId);
    expect(timeline?.entries.map((e) => e.type === "event" && e.kind)).toEqual(["SUBMITTED"]);
  });

  it("does not record twice: the same key replays, a second recording is refused", async () => {
    const s = await seed();
    const input = record();
    const [a, b] = await Promise.all([
      svc.recordExternalSubmission(s.workspaceId, s.applicationId, input),
      svc.recordExternalSubmission(s.workspaceId, s.applicationId, input),
    ]);
    expect([a, b].every((r) => r.ok)).toBe(true);
    expect(await svc.recordExternalSubmission(s.workspaceId, s.applicationId, input)).toEqual({ ok: true, replay: true });
    expect(await svc.recordExternalSubmission(s.workspaceId, s.applicationId, record())).toMatchObject({ ok: false, reason: "already_recorded" });
    expect(await db.applicationEvent.count({ where: { applicationId: s.applicationId } })).toBe(1);
  });

  it("keeps a confirmation as its own entry with its own time, and the application Applied", async () => {
    const s = await seed();
    await svc.recordExternalSubmission(
      s.workspaceId,
      s.applicationId,
      record({ confirmationText: "We received your application", confirmationAt: { local: "2026-11-20T14:32", timeZone: "Europe/Brussels" } }),
      [{ name: "confirmation.png", bytes: PNG }],
    );
    const timeline = await svc.loadTimeline(s.workspaceId, s.applicationId);
    const events = timeline!.entries.filter((e) => e.type === "event");
    expect(events.map((e) => e.kind)).toEqual(["SUBMITTED", "CONFIRMATION_RECEIVED"]);
    const confirmation = events[1];
    expect(confirmation.occurredAt).toBe("2026-11-20T13:32:00.000Z");
    expect(confirmation.attachments.map((a) => [a.kind, a.filename])).toEqual([["IMAGE", "confirmation.png"]]);
    expect(timeline!.application.status).toBe("APPLIED");
  });

  it("adds a confirmation screenshot and a saved email later, once each", async () => {
    const s = await seed();
    await svc.recordExternalSubmission(s.workspaceId, s.applicationId, record());
    const c = await svc.createEvent(
      s.workspaceId,
      s.applicationId,
      parse(createEventSchema, { clientKey: key(), kind: "CONFIRMATION_RECEIVED", occurredAt: { local: "2026-11-21T09:00", timeZone: "Europe/Brussels" } }),
    );
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(await svc.addAttachments(s.workspaceId, s.applicationId, c.eventId, [{ name: "shot.png", bytes: PNG }, { name: "mail.eml", bytes: EML }])).toEqual({ ok: true, added: 2 });
    expect(await svc.addAttachments(s.workspaceId, s.applicationId, c.eventId, [{ name: "again.png", bytes: PNG }])).toEqual({ ok: true, added: 0 });
    const files = await db.applicationEventAttachment.findMany({ where: { eventId: c.eventId }, orderBy: { createdAt: "asc" } });
    expect(files.map((f) => f.kind).sort()).toEqual(["EMAIL", "IMAGE"]);
    const eml = files.find((f) => f.kind === "EMAIL")!;
    expect((eml.emailPreview as { subject: string }).subject).toBe("Application received");
    expect(await db.application.findUniqueOrThrow({ where: { id: s.applicationId } })).toMatchObject({ status: "APPLIED" });

    const read = await svc.readAttachment(s.workspaceId, files[0].id);
    expect(read.ok).toBe(true);
  });

  it("refuses a file that is not a screenshot, PDF or email, and stores nothing", async () => {
    const s = await seed();
    const result = await svc.createEvent(
      s.workspaceId,
      s.applicationId,
      parse(createEventSchema, { clientKey: key(), kind: "NOTE", occurredAt: { local: "2026-11-21T09:00", timeZone: "UTC" } }),
      [{ name: "page.html", bytes: new TextEncoder().encode("<script>alert(1)</script>") }],
    );
    expect(result).toMatchObject({ ok: false, reason: "files", problem: "UNSUPPORTED_TYPE" });
    expect(await db.applicationEvent.count({ where: { applicationId: s.applicationId } })).toBe(0);
  });

  it("keeps replies and interviews as separate entries; status changes only when chosen", async () => {
    const s = await seed();
    await svc.recordExternalSubmission(s.workspaceId, s.applicationId, record());
    const at = (local: string) => ({ local, timeZone: "Europe/Brussels" });
    const confirmation = await svc.createEvent(s.workspaceId, s.applicationId, parse(createEventSchema, { clientKey: key(), kind: "CONFIRMATION_RECEIVED", occurredAt: at("2026-11-20T15:00") }));
    expect(confirmation.ok).toBe(true);
    expect((await db.application.findUniqueOrThrow({ where: { id: s.applicationId } })).status).toBe("APPLIED");

    await svc.createEvent(s.workspaceId, s.applicationId, parse(createEventSchema, { clientKey: key(), kind: "RECRUITER_REPLY", occurredAt: at("2026-11-22T10:00"), summary: "Can we talk Tuesday?", sender: "Sam (Acme)" }));
    await svc.createEvent(s.workspaceId, s.applicationId, parse(createEventSchema, { clientKey: key(), kind: "RECRUITER_REPLY", occurredAt: at("2026-11-23T10:00"), summary: "Confirmed for 10:00." }));
    await svc.createEvent(s.workspaceId, s.applicationId, parse(createEventSchema, { clientKey: key(), kind: "INTERVIEW", occurredAt: at("2026-11-25T10:00") }));
    expect((await db.application.findUniqueOrThrow({ where: { id: s.applicationId } })).status).toBe("APPLIED");

    await svc.createEvent(
      s.workspaceId,
      s.applicationId,
      parse(createEventSchema, { clientKey: key(), kind: "INTERVIEW", occurredAt: at("2026-11-26T10:00"), statusChange: "INTERVIEWING", followUpDate: "2026-12-01" }),
    );
    const app = await db.application.findUniqueOrThrow({ where: { id: s.applicationId } });
    expect(app.status).toBe("INTERVIEWING");
    expect(app.followUpDate?.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(app.appliedAt?.toISOString()).toBe("2026-11-20T13:30:00.000Z");

    const timeline = await svc.loadTimeline(s.workspaceId, s.applicationId);
    const events = timeline!.entries.filter((e) => e.type === "event");
    expect(events.map((e) => e.kind)).toEqual(["SUBMITTED", "CONFIRMATION_RECEIVED", "RECRUITER_REPLY", "RECRUITER_REPLY", "INTERVIEW", "INTERVIEW"]);
    expect(events.filter((e) => e.kind === "RECRUITER_REPLY").map((e) => e.summary)).toEqual(["Can we talk Tuesday?", "Confirmed for 10:00."]);
    expect(events[5]).toMatchObject({ fromStatus: "APPLIED", toStatus: "INTERVIEWING" });
  });

  it("editing submission details keeps a later stage, and edits/deletes of entries never move status", async () => {
    const s = await seed();
    await svc.recordExternalSubmission(s.workspaceId, s.applicationId, record());
    await db.application.update({ where: { id: s.applicationId }, data: { status: "OFFER" } });
    const edit = parse(editSubmissionSchema(), {
      appliedAt: { local: "2026-11-19T09:15", timeZone: "America/New_York" },
      channel: "OTHER",
      channelLabel: "Jobat",
      applicationUrl: "https://www.jobat.be/job/1",
      reference: "J-9",
      notes: "Applied via the Jobat portal",
    });
    expect(await svc.editExternalSubmission(s.workspaceId, s.applicationId, edit)).toEqual({ ok: true });
    const app = await db.application.findUniqueOrThrow({ where: { id: s.applicationId } });
    expect(app).toMatchObject({ status: "OFFER", submissionChannel: "OTHER", submissionChannelLabel: "Jobat", appliedTimeZone: "America/New_York" });
    expect(app.appliedAt?.toISOString()).toBe("2026-11-19T14:15:00.000Z");
    const submitted = await db.applicationEvent.findFirstOrThrow({ where: { applicationId: s.applicationId, kind: "SUBMITTED" } });
    expect(submitted.occurredAt.toISOString()).toBe("2026-11-19T14:15:00.000Z");
    expect(submitted.summary).toBe("Applied via the Jobat portal");

    expect(await svc.deleteEvent(s.workspaceId, s.applicationId, submitted.id)).toMatchObject({ ok: false, reason: "recorded_submission" });
    const note = await svc.createEvent(s.workspaceId, s.applicationId, parse(createEventSchema, { clientKey: key(), kind: "NOTE", occurredAt: { local: "2026-11-24T10:00", timeZone: "UTC" }, summary: "typo" }));
    if (!note.ok) throw new Error("note");
    await svc.updateEvent(s.workspaceId, s.applicationId, note.eventId, { kind: "NOTE", occurredAt: { at: new Date("2026-11-24T11:00:00Z"), timeZone: "UTC" }, summary: "fixed", sender: null, recipient: null, nextAction: null, followUpDate: null });
    expect((await db.applicationEvent.findUniqueOrThrow({ where: { id: note.eventId } })).summary).toBe("fixed");
    expect(await svc.deleteEvent(s.workspaceId, s.applicationId, note.eventId)).toEqual({ ok: true });
    expect((await db.application.findUniqueOrThrow({ where: { id: s.applicationId } })).status).toBe("OFFER");
  });

  it("undo removes only the submission and what was recorded with it", async () => {
    const s = await seed();
    await svc.recordExternalSubmission(s.workspaceId, s.applicationId, record({ confirmationText: "ok" }), [{ name: "c.png", bytes: PNG }]);
    const later = await svc.createEvent(s.workspaceId, s.applicationId, parse(createEventSchema, { clientKey: key(), kind: "NOTE", occurredAt: { local: "2026-11-24T10:00", timeZone: "UTC" } }));
    expect(later.ok).toBe(true);
    expect(await svc.undoExternalSubmission(s.workspaceId, s.applicationId)).toEqual({ ok: true, status: "SAVED" });
    const app = await db.application.findUniqueOrThrow({ where: { id: s.applicationId } });
    expect(app).toMatchObject({ status: "SAVED", appliedAt: null, submissionChannel: null, applicationUrl: null });
    expect(await db.targetJob.count({ where: { id: s.targetJobId } })).toBe(1);
    expect((await db.applicationEvent.findMany({ where: { applicationId: s.applicationId } })).map((e) => e.kind)).toEqual(["NOTE"]);
    expect(await db.applicationEventAttachment.count({ where: { workspaceId: s.workspaceId } })).toBe(0);
  });

  it("counts, filters and sorts external applications with the rest", async () => {
    const s = await seed();
    const second = await db.application.create({
      data: { workspaceId: s.workspaceId, targetJobId: s.targetJobId, status: "APPLIED", appliedAt: new Date("2026-11-24T10:00:00Z") },
    });
    await svc.recordExternalSubmission(s.workspaceId, s.applicationId, record({ followUpDate: "2026-11-27" }));
    const q = DEFAULT_APPLICATION_LIST_QUERY;
    const applied = await list.listApplicationPage(s.workspaceId, { ...q, status: "APPLIED" });
    expect(applied.total).toBe(2);
    expect((await list.listApplicationPage(s.workspaceId, { ...q, via: "external" })).applications.map((a) => a.id)).toEqual([s.applicationId]);
    expect((await list.listApplicationPage(s.workspaceId, { ...q, via: "indeed" })).total).toBe(1);
    expect((await list.listApplicationPage(s.workspaceId, { ...q, via: "linkedin" })).total).toBe(0);
    expect((await list.listApplicationPage(s.workspaceId, { ...q, via: "email" })).total).toBe(0);
    expect((await list.listApplicationPage(s.workspaceId, { ...q, sort: "applied" })).applications.map((a) => a.id)).toEqual([second.id, s.applicationId]);
    const due = await list.listApplicationPage(s.workspaceId, { ...q, due: "upcoming", today: "2026-11-25" });
    expect(due.applications.map((a) => a.id)).toEqual([s.applicationId]);
    const row = due.applications[0];
    expect(row.events[0]).toMatchObject({ kind: "SUBMITTED" });
    expect(row._count.events).toBe(1);
  });

  it("never reaches another workspace's application, entries or files", async () => {
    const mine = await seed();
    const theirs = await seed();
    await svc.recordExternalSubmission(mine.workspaceId, mine.applicationId, record({ confirmationText: "x" }), [{ name: "c.png", bytes: PNG }]);
    const file = await db.applicationEventAttachment.findFirstOrThrow({ where: { workspaceId: mine.workspaceId } });
    const event = await db.applicationEvent.findFirstOrThrow({ where: { applicationId: mine.applicationId, kind: "CONFIRMATION_RECEIVED" } });

    expect(await svc.loadTimeline(theirs.workspaceId, mine.applicationId)).toBeNull();
    expect(await svc.recordExternalSubmission(theirs.workspaceId, mine.applicationId, record())).toMatchObject({ ok: false, reason: "not_found" });
    expect(await svc.createEvent(theirs.workspaceId, mine.applicationId, parse(createEventSchema, { clientKey: key(), kind: "NOTE", occurredAt: { local: "2026-11-24T10:00", timeZone: "UTC" } }))).toMatchObject({ ok: false, reason: "not_found" });
    expect(await svc.deleteEvent(theirs.workspaceId, mine.applicationId, event.id)).toMatchObject({ ok: false, reason: "not_found" });
    expect(await svc.addAttachments(theirs.workspaceId, theirs.applicationId, event.id, [{ name: "x.png", bytes: PNG }])).toMatchObject({ ok: false, reason: "not_found" });
    expect(await svc.readAttachment(theirs.workspaceId, file.id)).toMatchObject({ ok: false, reason: "not_found" });
    expect(await svc.deleteAttachment(theirs.workspaceId, file.id)).toMatchObject({ ok: false, reason: "not_found" });
    expect(await svc.undoExternalSubmission(theirs.workspaceId, mine.applicationId)).toMatchObject({ ok: false, reason: "not_found" });
    expect(await db.applicationEventAttachment.count({ where: { id: file.id } })).toBe(1);
  });

  it("undo keeps Applied when an accepted ResuMatch email exists", async () => {
    const s = await seed();
    const sentAt = new Date("2026-11-18T08:00:00Z");
    await db.sentApplicationEmail.create({
      data: {
        workspaceId: s.workspaceId,
        applicationId: s.applicationId,
        idempotencyKey: `${s.workspaceId}:${key()}`,
        targetJobId: s.targetJobId,
        companyKey: "acme",
        companyName: "Acme",
        contactEmail: "hr@example.com",
        contactEmailNormalized: "hr@example.com",
        fromAddress: "noreply@example.com",
        subject: "Application",
        body: "Hello",
        messageId: `<${key()}@example.com>`,
        status: "ACCEPTED",
        sentAt,
      },
    });
    await db.application.update({ where: { id: s.applicationId }, data: { status: "APPLIED", appliedAt: sentAt } });
    await svc.recordExternalSubmission(s.workspaceId, s.applicationId, record());
    expect(await svc.undoExternalSubmission(s.workspaceId, s.applicationId)).toEqual({ ok: true, status: "APPLIED" });
    const app = await db.application.findUniqueOrThrow({ where: { id: s.applicationId } });
    expect(app.appliedAt?.toISOString()).toBe(sentAt.toISOString());
    const timeline = await svc.loadTimeline(s.workspaceId, s.applicationId);
    expect(timeline!.entries.map((e) => e.type)).toEqual(["email"]);
  });
});
