import { describe, expect, it } from "vitest";
import { buildHandoff, type TasksaiTasksPayload } from "@asafarim/tool-handoff";
import type { RequestContext } from "../context";
import { handoffAudit, stageHandoffRows } from "./handoff";
import { createHandoffImport } from "./service";

const now = new Date();
const payload: TasksaiTasksPayload = {
  title: "Help centre move",
  objective: "Move the help centre.",
  tasks: [
    { ref: "T1", title: "Build an inventory", description: "List every article.", basis: "extracted", evidence: ["Need an inventory of articles."], waitsFor: [] },
    {
      ref: "T4",
      title: "Review the style guide",
      description: "",
      basis: "inferred",
      evidence: ["Priya can review the style guide, but only after the inventory exists."],
      rationale: "Follows the inventory.",
      effort: { low: 4, high: 8, unit: "hours" },
      waitsFor: ["T1"],
    },
  ],
  risks: [],
  questions: [],
};
const envelope = buildHandoff("tasksai", { app: "web", tool: "notes-to-action-plan", toolVersion: "1.0.0", schemaVersion: "action-plan/1" }, payload, { now });

describe("stageHandoffRows", () => {
  it("stages one row per task with stable keys, keeping evidence, provenance, effort, and dependencies visible", () => {
    const rows = stageHandoffRows(envelope);
    expect(rows.map((r) => [r.rowKey, r.data.title, r.status])).toEqual([
      [`${envelope.handoffId}:T1`, "Build an inventory", "ok"],
      [`${envelope.handoffId}:T4`, "Review the style guide", "ok"],
    ]);
    expect(rows[1].data.description).toContain("Source: AI Workbench notes-to-action-plan (Inferred: Follows the inventory.).");
    expect(rows[1].data.description).toContain("> Priya can review the style guide");
    expect(rows[1].data.description).toContain("Effort estimate: 4–8 hours.");
    expect(rows[1].data.description).toContain("Waits for: Build an inventory.");
  });

  it("never sets a due date or an assignee", () => {
    for (const row of stageHandoffRows(envelope)) {
      expect(row.data).not.toHaveProperty("dueDate");
      expect(Object.keys(row.data).sort()).toEqual(["description", "title"]);
    }
  });

  it("audits ids and versions only", () => {
    expect(handoffAudit(envelope)).toEqual({
      handoffId: envelope.handoffId,
      handoffVersion: "asafarim-handoff/1",
      payloadVersion: "tasksai-tasks/1",
      sourceApp: "web",
      sourceTool: "notes-to-action-plan",
      toolVersion: "1.0.0",
      schemaVersion: "action-plan/1",
    });
  });
});

describe("createHandoffImport", () => {
  function fakeCtx(role: "member" | "guest" = "member") {
    const jobs: Record<string, unknown>[] = [];
    const db = {
      project: { findFirst: async ({ where }: { where: { id: string } }) => (where.id === "p1" ? { id: "p1" } : null) },
      importJob: {
        findFirst: async ({ where }: { where: { mapping: { equals: string } } }) =>
          jobs.find((j) => (j.mapping as { handoffId: string }).handoffId === where.mapping.equals) ?? null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const job = { id: `job${jobs.length + 1}`, appliedRows: 0, ...data };
          jobs.push(job);
          return job;
        },
      },
    };
    const ctx = { db, workspaceId: "w1", workspaceSlug: "w", correlationId: "c", actor: { membershipId: "m1", platformUserId: "u1", role } } as unknown as RequestContext;
    return { ctx, jobs };
  }
  const body = { projectId: "p1", content: JSON.stringify(envelope) };

  it("previews exactly what apply will create, and returns the same job for the same file", async () => {
    const { ctx, jobs } = fakeCtx();
    const first = await createHandoffImport(ctx, body);
    expect(first).toMatchObject({ state: "dry_run_ready", okRows: 2, alreadyImported: false });
    expect(first.preview?.map((p) => p.title)).toEqual(["Build an inventory", "Review the style guide"]);
    const again = await createHandoffImport(ctx, body);
    expect(again.id).toBe(first.id);
    expect(jobs).toHaveLength(1);
    expect(JSON.stringify(jobs[0].mapping)).not.toMatch(/inventory|Priya/i);
  });

  it("refuses an invalid, misdirected, or edited file with a recovery message and creates nothing", async () => {
    const { ctx, jobs } = fakeCtx();
    const bad = { ...envelope, payload: { ...payload, tasks: [{ ...payload.tasks[0], assignee: "Sam" }] } };
    for (const content of ["{", JSON.stringify({ ...envelope, destination: "testora", payloadVersion: "testora-scenarios/1" }), JSON.stringify(bad)]) {
      await expect(createHandoffImport(ctx, { projectId: "p1", content })).rejects.toMatchObject({ code: "validation_failed" });
    }
    expect(jobs).toHaveLength(0);
  });

  it("requires a role that can create tasks", async () => {
    const { ctx } = fakeCtx("guest");
    await expect(createHandoffImport(ctx, body)).rejects.toMatchObject({ code: "forbidden" });
  });
});
