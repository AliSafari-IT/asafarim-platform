import { describe, expect, it } from "vitest";
import { parseTemporalPhrase, toTimelineEventsImport } from "@asafarim/timeline-contract";
import { buildHandoff, handoffKey, HANDOFF_TTL_DAYS, MAX_HANDOFF_BYTES, parseHandoff, type TasksaiTasksPayload, type TestoraScenariosPayload } from "./index";

const source = { app: "web" as const, tool: "notes-to-action-plan", toolVersion: "1.0.0", schemaVersion: "action-plan/1" };
const now = new Date("2026-09-27T12:00:00Z");
const id = "0b6f2a4e-5c1d-4e8f-9a7b-3c2d1e0f9a8b";

const tasks: TasksaiTasksPayload = {
  title: "Newsletter launch",
  objective: "Send the first issue.",
  tasks: [
    { ref: "T1", title: "Pick an email tool", description: "", basis: "extracted", evidence: ["Need to pick an email tool."], waitsFor: [] },
    { ref: "T2", title: "Draft the first issue", description: "", basis: "inferred", evidence: [], rationale: "Follows the tool choice.", effort: { low: 2, high: 4, unit: "hours" }, waitsFor: ["T1"] },
  ],
  risks: ["Low sign-ups."],
  questions: ["Import the old list?"],
};
const scenarios: TestoraScenariosPayload = {
  title: "Checkout discount",
  summary: "",
  scenarios: [{ ref: "TC-01", title: "Apply a valid code", category: "happy_path", priority: "high", basis: "extracted", preconditions: [], steps: ["Apply it"], expected: "Total reduced.", evidence: ["A valid code reduces the total."] }],
  questions: [],
};

const file = (value: unknown) => JSON.stringify(value);

describe("handoff envelope", () => {
  it("round-trips for each destination", () => {
    const t = buildHandoff("tasksai", source, tasks, { now, id });
    expect(parseHandoff(file(t), "tasksai", now)).toEqual({ ok: true, envelope: t });
    const s = buildHandoff("testora", { ...source, tool: "requirements-to-test-plan", schemaVersion: "test-plan/1" }, scenarios, { now, id });
    expect(parseHandoff(file(s), "testora", now).ok).toBe(true);
    const events = toTimelineEventsImport([{ title: "Founded", when: parseTemporalPhrase("12 March 1891"), citations: [{ label: "S1", excerpt: "…" }], confidence: "high", inferred: false }])!;
    const tl = buildHandoff("timelineai", { ...source, tool: "text-to-cited-timeline" }, { title: "Library", summary: "", ...events.payload }, { now, id });
    expect(parseHandoff(file(tl), "timelineai", now).ok).toBe(true);
    expect(t).toMatchObject({ handoffVersion: "asafarim-handoff/1", payloadVersion: "tasksai-tasks/1", expiresAt: "2026-10-04T12:00:00.000Z" });
  });

  it.each([
    ["not JSON", "{", "not_json"],
    ["some other JSON", file({ items: [] }), "not_handoff"],
    ["a future envelope version", file({ ...buildHandoff("tasksai", source, tasks, { now, id }), handoffVersion: "asafarim-handoff/2" }), "unsupported_version"],
    ["a future payload version", file({ ...buildHandoff("tasksai", source, tasks, { now, id }), payloadVersion: "tasksai-tasks/2" }), "unsupported_version"],
    ["a file for another app", file(buildHandoff("testora", source, scenarios, { now, id })), "wrong_destination"],
    ["an oversized file", " ".repeat(MAX_HANDOFF_BYTES + 1), "too_large"],
  ])("refuses %s with a recovery message", (_, text, code) => {
    const result = parseHandoff(text, "tasksai", now);
    expect(result).toMatchObject({ ok: false, code });
    expect(!result.ok && result.message.length).toBeGreaterThan(20);
  });

  it("names the app a misdirected file belongs to", () => {
    const result = parseHandoff(file(buildHandoff("testora", source, scenarios, { now, id })), "tasksai", now);
    expect(!result.ok && result.message).toBe("This file was made for Testora. Import it in Testora instead; nothing was imported here.");
  });

  it("expires after the TTL and refuses files dated in the future", () => {
    const t = file(buildHandoff("tasksai", source, tasks, { now, id }));
    expect(parseHandoff(t, "tasksai", new Date(now.getTime() + (HANDOFF_TTL_DAYS + 1) * 86_400_000))).toMatchObject({ ok: false, code: "expired" });
    expect(parseHandoff(t, "tasksai", new Date(now.getTime() - 3_600_000))).toMatchObject({ ok: false, code: "expired" });
  });

  it("rejects edited payloads: dangling or self dependencies, duplicate refs, assignees, due dates", () => {
    const bad = (mutate: (p: TasksaiTasksPayload) => void) => {
      const p = structuredClone(tasks);
      mutate(p);
      return parseHandoff(file(buildHandoff("tasksai", source, p, { now, id })), "tasksai", now);
    };
    expect(bad((p) => (p.tasks[1].waitsFor = ["T9"]))).toMatchObject({ ok: false, code: "invalid_payload" });
    expect(bad((p) => (p.tasks[0].waitsFor = ["T1"]))).toMatchObject({ ok: false, code: "invalid_payload" });
    expect(bad((p) => (p.tasks[1].ref = "T1"))).toMatchObject({ ok: false, code: "invalid_payload" });
    expect(bad((p) => Object.assign(p.tasks[0], { assignee: "Sam" }))).toMatchObject({ ok: false, details: ["payload.tasks[0].assignee (not allowed)"] });
    expect(bad((p) => Object.assign(p.tasks[0], { dueDate: "2026-10-01" }))).toMatchObject({ ok: false, code: "invalid_payload" });
    expect(bad((p) => (p.tasks[0].title = "x".repeat(201)))).toMatchObject({ ok: false, code: "invalid_payload" });
  });

  it("requires evidence or an assumption on every scenario and a citation or inference flag on every event", () => {
    const s = structuredClone(scenarios);
    s.scenarios[0].evidence = [];
    expect(parseHandoff(file(buildHandoff("testora", source, s, { now, id })), "testora", now)).toMatchObject({ ok: false, code: "invalid_payload" });
    const events = toTimelineEventsImport([{ title: "E", when: parseTemporalPhrase("1990"), citations: [{ label: "S1" }], confidence: "low", inferred: false }])!;
    const payload = { title: "T", summary: "", ...events.payload };
    payload.events[0] = { ...payload.events[0], citations: [], uncitedInference: false };
    expect(parseHandoff(file(buildHandoff("timelineai", source, payload, { now, id })), "timelineai", now)).toMatchObject({ ok: false, code: "invalid_payload" });
  });

  it("derives a stable, URL-safe key from the handoff id", () => {
    expect(handoffKey(id)).toBe("0b6f2a4e5c1d4e8f");
  });
});
