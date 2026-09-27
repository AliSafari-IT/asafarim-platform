import { describe, expect, it } from "vitest";
import { parseTemporalPhrase, toTimelineEventsImport } from "@asafarim/timeline-contract";
import { buildHandoff } from "@asafarim/tool-handoff";
import { isSameOriginJson } from "../same-origin";
import { confirmWorkbenchImport, previewWorkbenchImport, toTimelineInput, type ImportDeps } from "../services/workbench-import";

const now = new Date("2026-09-27T12:00:00Z");
const source = { app: "web" as const, tool: "text-to-cited-timeline", toolVersion: "1.0.0", schemaVersion: "cited-timeline/1" };
const events = toTimelineEventsImport([
  { title: "Founded", when: parseTemporalPhrase("12 March 1891"), citations: [{ label: "S1", excerpt: "Founded on 12 March 1891." }], confidence: "high", inferred: false },
  { title: "Moved", when: parseTemporalPhrase("the 1920s"), citations: [{ label: "S3" }], confidence: "medium", inferred: false },
  { title: "Outgrew the building", when: parseTemporalPhrase(""), citations: [], confidence: "low", inferred: true },
])!;
const envelope = buildHandoff("timelineai", source, { title: "Riverside Library", summary: "A short history.", ...events.payload }, { now, id: "0b6f2a4e-5c1d-4e8f-9a7b-3c2d1e0f9a8b" });
const file = JSON.stringify(envelope);
const user = { userId: "user_1", isAdmin: false, guestIdHash: null };

function fakeDeps() {
  const created: Parameters<ImportDeps["createWithAudit"]>[0][] = [];
  const deps: ImportDeps = {
    findPriorImport: async (userId, handoffId) => {
      const hit = created.find((c) => c.userId === userId && c.audit.handoffId === handoffId);
      return hit ? { timelineId: "tl_1" } : null;
    },
    createWithAudit: async (args) => {
      created.push(args);
      return { timelineId: "tl_1" };
    },
  };
  return { deps, created };
}

describe("Workbench import preview", () => {
  it("shows every event with its date, precision, and evidence, and writes nothing", () => {
    const preview = previewWorkbenchImport(file, now);
    expect(preview).toMatchObject({ ok: true, title: "Riverside Library", source: { tool: "text-to-cited-timeline" } });
    expect(preview.ok && preview.events).toEqual([
      { title: "Founded", date: "12 March 1891", precision: "day", confidence: "high", citations: 1, uncited: false },
      { title: "Moved", date: "the 1920s", precision: "decade", confidence: "medium", citations: 1, uncited: false },
      { title: "Outgrew the building", date: "Undated", precision: "unknown", confidence: "low", citations: 0, uncited: true },
    ]);
  });

  it.each([
    ["not a handoff", "{}", "not_handoff"],
    ["a file for another app", JSON.stringify({ ...envelope, destination: "tasksai", payloadVersion: "tasksai-tasks/1" }), "wrong_destination"],
    ["an expired file", file, "expired"],
  ])("refuses %s with a recovery message", (_, text, code) => {
    const at = code === "expired" ? new Date("2026-11-01T00:00:00Z") : now;
    expect(previewWorkbenchImport(text, at)).toMatchObject({ ok: false, code, message: expect.stringMatching(/\w/) });
  });

  it("re-checks with TimelineAI's own schema", () => {
    const bad = structuredClone(envelope);
    (bad.payload.events[0] as unknown as Record<string, unknown>).temporalValue = { precision: "day", era: "CE", year: 99999, displayText: "x" };
    expect(previewWorkbenchImport(JSON.stringify(bad), now)).toMatchObject({ ok: false, code: "invalid_payload" });
  });
});

describe("mapping to the editor", () => {
  it("sets startAt only for exact dates, keeps precision, and keeps evidence and the uncited flag visible", () => {
    const { input, temporalValues } = toTimelineInput(envelope, "  My library  ");
    expect(input.title).toBe("My library");
    expect(input.events.map((e) => [e.startAt ?? null, e.displayDate])).toEqual([
      ["1891-03-12T00:00:00.000Z", "12 March 1891"],
      [null, "the 1920s"],
      [null, "Undated"],
    ]);
    expect(temporalValues.map((v) => v?.precision)).toEqual(["day", "decade", "unknown"]);
    expect(input.events[0].description).toContain('Source S1: "Founded on 12 March 1891."');
    expect(input.events[2].description).toContain("Uncited inference");
  });
});

describe("confirm", () => {
  it("requires a signed-in user", async () => {
    const { deps, created } = fakeDeps();
    expect(await confirmWorkbenchImport(file, { userId: null, isAdmin: false, guestIdHash: "g" }, "t", deps, now)).toMatchObject({ ok: false, code: "sign_in" });
    expect(created).toHaveLength(0);
  });

  it("creates once per user and handoff id, and the audit holds no event text", async () => {
    const { deps, created } = fakeDeps();
    expect(await confirmWorkbenchImport(file, user, "Library", deps, now)).toEqual({ ok: true, status: "created", timelineId: "tl_1", events: 3 });
    expect(await confirmWorkbenchImport(file, user, "Library", deps, now)).toEqual({ ok: true, status: "already_imported", timelineId: "tl_1", events: 3 });
    expect(created).toHaveLength(1);
    expect(created[0].audit).toEqual({
      handoffId: envelope.handoffId,
      handoffVersion: "asafarim-handoff/1",
      payloadVersion: "timelineai-events/1",
      sourceApp: "web",
      sourceTool: "text-to-cited-timeline",
      toolVersion: "1.0.0",
      schemaVersion: "cited-timeline/1",
      events: 3,
      outcome: "created",
    });
    expect(JSON.stringify(created[0].audit)).not.toMatch(/Founded|1891|library/i);
  });

  it("an invalid file creates nothing", async () => {
    const { deps, created } = fakeDeps();
    expect(await confirmWorkbenchImport("{", user, "x", deps, now)).toMatchObject({ ok: false, code: "not_json" });
    expect(created).toHaveLength(0);
  });
});

describe("CSRF guard", () => {
  const req = (h: Record<string, string>) => new Request("https://tlai.asafarim.com/api/imports/workbench/confirm", { method: "POST", headers: { host: "tlai.asafarim.com", ...h } });
  it.each([
    [{ "content-type": "application/json", origin: "https://tlai.asafarim.com" }, true],
    [{ "content-type": "application/json", origin: "https://evil.example" }, false],
    [{ "content-type": "text/plain", origin: "https://tlai.asafarim.com" }, false],
    [{ "content-type": "application/json", "sec-fetch-site": "cross-site" }, false],
  ])("%j → %s", (headers, expected) => {
    expect(isSameOriginJson(req(headers))).toBe(expected);
  });
});
