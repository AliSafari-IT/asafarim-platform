import { describe, expect, it } from "vitest";
import { applyResult, discard, enqueue, isQueueable, next, syncState } from "./queue";

const req = { method: "PATCH" as const, path: "/workspaces/w/tasks/t", body: { title: "x" }, version: 3 };

describe("offline queue", () => {
  it("only allows allowlisted mutation kinds", () => {
    expect(isQueueable("task.update")).toBe(true);
    expect(isQueueable("workspace.delete")).toBe(false);
  });

  it("enqueues FIFO and next() returns the oldest pending", () => {
    let q = enqueue([], "task.update", req, 100);
    q = enqueue(q, "task.complete", { method: "POST", path: "/x", body: {} }, 200);
    expect(next(q)!.createdAt).toBe(100);
  });

  it("a successful replay drops the entry", () => {
    const q = enqueue([], "task.update", req, 1);
    const after = applyResult(q, q[0].id, { ok: true });
    expect(after).toHaveLength(0);
  });

  it("a 409 marks the entry as a conflict, not lost", () => {
    const q = enqueue([], "task.update", req, 1);
    const after = applyResult(q, q[0].id, { ok: false, status: 409 });
    expect(after[0].status).toBe("conflict");
    expect(syncState(after).conflicts).toBe(1);
  });

  it("a 5xx retries up to maxAttempts then fails", () => {
    let q = enqueue([], "task.update", req, 1);
    for (let i = 0; i < 5; i++) q = applyResult(q, q[0].id, { ok: false, status: 500 }, 5);
    expect(q[0].status).toBe("failed");
    expect(q[0].attempts).toBe(5);
  });

  it("a 4xx (non-429) fails immediately without retrying", () => {
    const q = enqueue([], "task.update", req, 1);
    const after = applyResult(q, q[0].id, { ok: false, status: 422, message: "bad" });
    expect(after[0].status).toBe("failed");
    expect(after[0].attempts).toBe(1);
  });

  it("syncState reports idle when nothing is pending; discard removes an entry", () => {
    let q = enqueue([], "task.update", req, 1);
    q = applyResult(q, q[0].id, { ok: false, status: 409 });
    expect(syncState(q).idle).toBe(true); // a conflict is not "pending"
    q = discard(q, q[0].id);
    expect(q).toHaveLength(0);
  });
});
