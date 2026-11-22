import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ContactPreferences } from "../../contactPreferences/contract";

/**
 * The contact paragraph (#940) in a generated application email, with the
 * fixture provider against a real database: none saved leaves the email as
 * it was, the defaults, an override or "leave out" pick the paragraph, and
 * it always sits before the sign-off. Guarded behind
 * `RESUMATCH_TEST_DATABASE_URL`; `pnpm test` never touches a database.
 */

const TEST_DB = process.env.RESUMATCH_TEST_DATABASE_URL;
if (TEST_DB) process.env.RESUMATCH_DATABASE_URL = TEST_DB;

const PREFS: ContactPreferences = {
  callWindows: [{ days: [1, 2, 3, 4, 5], start: "16:00", end: "18:00" }],
  timeZone: "Europe/Brussels",
  outsideHours: "arrange",
  unavailable: [],
  email: true,
  whatsapp: true,
};

describe.skipIf(!TEST_DB)("generateApplicationEmail — contact paragraph", () => {
  let db: import("../../db/generated").PrismaClient;
  let gen: typeof import("./generate");
  let store: typeof import("../../contactPreferences/store");
  let contract: typeof import("../../contactPreferences/contract");
  const workspaceIds: string[] = [];

  async function seed(language = "en") {
    const { createVersion, confirmVersion } = await import("../../profile/versions");
    const { buildCoverLetterContent } = await import("../../tailoring/ai/coverLetter/schema");
    const ws = await db.workspace.create({ data: { platformUserId: `contact-gen-${randomUUID()}` }, select: { id: true } });
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
      data: { workspaceId: ws.id, sourceUrl: "https://example.test/jobs/1", rawText: "We need a TypeScript engineer.", title: "Backend Engineer", employer: "Acme B.V.", status: "FETCHED" },
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
    await db.coverLetter.create({
      data: {
        workspaceId: ws.id,
        profileVersionId: version.id,
        targetJobId: job.id,
        tailoredResumeId: resume.id,
        content: buildCoverLetterContent({ greeting: "Dear team,", paragraphs: ["I build TypeScript services."], signOff: "Kind regards," }, "Robin Example"),
        promptVersion: "cover_letter@1",
        modelVersion: "fixture",
        outputLanguage: language,
      },
    });
    const application = await db.application.create({ data: { workspaceId: ws.id, targetJobId: job.id, tailoredResumeId: resume.id, status: "SAVED" }, select: { id: true } });
    return { workspaceId: ws.id, applicationId: application.id };
  }

  beforeAll(async () => {
    gen = await import("./generate");
    store = await import("../../contactPreferences/store");
    contract = await import("../../contactPreferences/contract");
    db = (await import("../../db/client")).getJobmatchDb();
  });

  afterAll(async () => {
    if (!db || workspaceIds.length === 0) return;
    await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
  });

  it("with nothing saved, adds no paragraph", async () => {
    const s = await seed();
    const out = await gen.generateApplicationEmail(s.workspaceId, s.applicationId, { provider: "fixture" });
    expect(out).toMatchObject({ ok: true, contactParagraph: null });
  });

  it("uses the saved defaults, placed just before the sign-off", async () => {
    const s = await seed();
    await store.saveContactPreferences(s.workspaceId, PREFS);
    const out = await gen.generateApplicationEmail(s.workspaceId, s.applicationId, { provider: "fixture" });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const expected = contract.renderContactParagraph(PREFS, "en")!;
    expect(out.contactParagraph).toBe(expected);
    const blocks = out.body.split("\n\n");
    expect(blocks.at(-2)).toBe(expected);
    expect(blocks.at(-1)).toBe("Kind regards,\nRobin Example");
  });

  it("follows the email's language", async () => {
    const s = await seed("fr");
    await store.saveContactPreferences(s.workspaceId, PREFS);
    const out = await gen.generateApplicationEmail(s.workspaceId, s.applicationId, { provider: "fixture" });
    expect(out.ok && out.contactParagraph).toBe(contract.renderContactParagraph(PREFS, "fr"));
  });

  it("uses an override, or leaves the paragraph out", async () => {
    const s = await seed();
    await store.saveContactPreferences(s.workspaceId, PREFS);
    const override = { ...PREFS, callWindows: [], whatsapp: false };
    const changed = await gen.generateApplicationEmail(s.workspaceId, s.applicationId, { provider: "fixture", contact: { mode: "OVERRIDE", override } });
    expect(changed.ok && changed.contactParagraph).toBe(contract.renderContactParagraph(override, "en"));

    const omitted = await gen.generateApplicationEmail(s.workspaceId, s.applicationId, { provider: "fixture", contact: { mode: "OMIT", override: null } });
    expect(omitted).toMatchObject({ ok: true, contactParagraph: null });
    if (omitted.ok) expect(omitted.body).not.toContain("reach me");
  });
});
