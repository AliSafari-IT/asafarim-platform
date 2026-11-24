import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { EMPTY_WRITING_PREFERENCES, type WritingPreferences } from "./contract";

/**
 * #931 store: revisions, stale concurrent saves, reset, delete and
 * workspace isolation, against a throwaway database.
 */
const url = process.env.RESUMATCH_TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

const prefs = (over: Partial<WritingPreferences["coverLetter"]> = {}, cv: Partial<WritingPreferences["cv"]> = {}): WritingPreferences => ({
  cv: { ...EMPTY_WRITING_PREFERENCES.cv, ...cv },
  coverLetter: { ...EMPTY_WRITING_PREFERENCES.coverLetter, ...over },
});

d("writing preferences store (#931)", () => {
  let store: typeof import("./store");
  let db: ReturnType<typeof import("../db/client").getJobmatchDb>;
  const ws = { a: "", b: "" };

  beforeAll(async () => {
    process.env.RESUMATCH_DATABASE_URL = url;
    store = await import("./store");
    db = (await import("../db/client")).getJobmatchDb();
  });

  beforeEach(async () => {
    await db.writingPreferenceRevision.deleteMany({});
    await db.workspace.deleteMany({ where: { platformUserId: { in: ["wp-user-a", "wp-user-b"] } } });
    ws.a = (await db.workspace.create({ data: { platformUserId: "wp-user-a" } })).id;
    ws.b = (await db.workspace.create({ data: { platformUserId: "wp-user-b" } })).id;
  });

  afterAll(async () => {
    await db?.workspace.deleteMany({ where: { platformUserId: { in: ["wp-user-a", "wp-user-b"] } } });
  });

  it("adds an immutable revision per save and reads the latest", async () => {
    expect(await store.getWritingPreferences(ws.a)).toBeNull();
    const first = await store.saveWritingPreferences(ws.a, prefs({ tone: "warm" }), null);
    expect(first.ok && first.current?.revisionNumber).toBe(1);
    const firstId = first.ok ? first.current!.revisionId : "";
    const second = await store.saveWritingPreferences(ws.a, prefs({ tone: "confident" }, { styleNote: "Short, plain sentences." }), firstId);
    expect(second.ok && second.current?.revisionNumber).toBe(2);
    const current = await store.getWritingPreferences(ws.a);
    expect(current?.preferences.coverLetter.tone).toBe("confident");
    expect(current?.preferences.cv.styleNote).toBe("Short, plain sentences.");
    // The first revision is untouched.
    const old = await db.writingPreferenceRevision.findUnique({ where: { id: firstId } });
    expect((old?.content as unknown as WritingPreferences).coverLetter.tone).toBe("warm");
  });

  it("writes nothing when the values did not change", async () => {
    const first = await store.saveWritingPreferences(ws.a, prefs({ length: "short" }), null);
    const again = await store.saveWritingPreferences(ws.a, prefs({ length: "short" }), first.ok ? first.current!.revisionId : null);
    expect(again).toMatchObject({ ok: true, changed: false });
    expect(await db.writingPreferenceRevision.count({ where: { workspaceId: ws.a } })).toBe(1);
  });

  it("refuses a save made from an older revision and returns the current one", async () => {
    const first = await store.saveWritingPreferences(ws.a, prefs({ tone: "warm" }), null);
    const base = first.ok ? first.current!.revisionId : null;
    const tabOne = await store.saveWritingPreferences(ws.a, prefs({ tone: "confident" }), base);
    expect(tabOne.ok).toBe(true);
    const tabTwo = await store.saveWritingPreferences(ws.a, prefs({ tone: "formal" }), base);
    expect(tabTwo).toMatchObject({ ok: false, reason: "stale" });
    expect(!tabTwo.ok && tabTwo.current?.preferences.coverLetter.tone).toBe("confident");
    // A client that saw nothing cannot overwrite an existing revision either.
    expect(await store.saveWritingPreferences(ws.a, prefs({ tone: "formal" }), null)).toMatchObject({ ok: false });
  });

  it("lets only one of two racing saves land", async () => {
    const results = await Promise.all([
      store.saveWritingPreferences(ws.a, prefs({ tone: "warm" }), null),
      store.saveWritingPreferences(ws.a, prefs({ tone: "confident" }), null),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.writingPreferenceRevision.count({ where: { workspaceId: ws.a } })).toBe(1);
  });

  it("resets with an empty revision and deletes every revision", async () => {
    const first = await store.saveWritingPreferences(ws.a, prefs({ tone: "warm" }, { styleNote: "Plain words." }), null);
    const reset = await store.saveWritingPreferences(ws.a, EMPTY_WRITING_PREFERENCES, first.ok ? first.current!.revisionId : null);
    expect(reset.ok && reset.current?.preferences).toEqual(EMPTY_WRITING_PREFERENCES);
    expect(await db.writingPreferenceRevision.count({ where: { workspaceId: ws.a } })).toBe(2);
    expect(await store.deleteWritingPreferences(ws.a)).toBe(2);
    expect(await store.getWritingPreferences(ws.a)).toBeNull();
    const audit = await db.auditEvent.findMany({ where: { workspaceId: ws.a, action: { startsWith: "writing_preferences." } }, orderBy: { createdAt: "asc" } });
    expect(audit.map((e) => e.action)).toEqual(["writing_preferences.saved", "writing_preferences.reset", "writing_preferences.deleted"]);
    // The audit trail never holds the note itself.
    expect(JSON.stringify(audit.map((e) => e.metadata))).not.toContain("Plain words");
  });

  it("keeps workspaces apart", async () => {
    const a = await store.saveWritingPreferences(ws.a, prefs({ tone: "warm" }), null);
    expect(await store.getWritingPreferences(ws.b)).toBeNull();
    // Another workspace's revision id is not a valid base here.
    const b = await store.saveWritingPreferences(ws.b, prefs({ tone: "confident" }), a.ok ? a.current!.revisionId : null);
    expect(b).toMatchObject({ ok: false, reason: "stale", current: null });
    await store.deleteWritingPreferences(ws.b);
    expect((await store.getWritingPreferences(ws.a))?.preferences.coverLetter.tone).toBe("warm");
  });
});
