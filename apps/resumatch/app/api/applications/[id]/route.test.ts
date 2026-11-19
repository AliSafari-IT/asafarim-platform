import { beforeEach, describe, expect, it, vi } from "vitest";

const updateApplication = vi.fn();
const getCurrentWorkspace = vi.fn();
const logError = vi.fn();

vi.mock("../../../../lib/applications/service", async () => {
  class ApplicationNotFoundError extends Error {}
  return { ApplicationNotFoundError, updateApplication: (...a: unknown[]) => updateApplication(...a) };
});
vi.mock("../../../../lib/workspace", () => ({ getCurrentWorkspace: () => getCurrentWorkspace() }));
vi.mock("../../../../lib/observability/logger", () => ({ logError: (...a: unknown[]) => logError(...a) }));

import { ApplicationNotFoundError } from "../../../../lib/applications/service";
import { PATCH } from "./route";

const NOTE = "private note: salary expectation 95k";

const patch = (body: unknown, id = "app-1") =>
  PATCH(
    new Request(`http://localhost/api/applications/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

beforeEach(() => {
  updateApplication.mockReset().mockResolvedValue({ id: "app-1" });
  getCurrentWorkspace.mockReset().mockResolvedValue({ id: "ws-1" });
  logError.mockReset();
});

describe("PATCH /api/applications/[id]", () => {
  it("401s without a workspace and writes nothing", async () => {
    getCurrentWorkspace.mockResolvedValue(null);
    const res = await patch({ notes: "x" });
    expect(res.status).toBe(401);
    expect(updateApplication).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid JSON", "{not json"],
    ["non-object JSON", "42"],
    ["null", "null"],
    ["an array", [{ notes: "x" }]],
    ["an empty object", {}],
    ["an unknown key", { notes: "x", workspaceId: "ws-2" }],
    ["a non-string note", { notes: 42 }],
    ["an invalid date", { followUpDate: "not-a-date" }],
    ["an impossible date", { followUpDate: "2026-02-30" }],
    ["a numeric date", { followUpDate: 1_700_000_000_000 }],
    ["a day outside the accepted range", { followUpDate: "0002-11-19" }],
    ["a timestamp without an offset", { followUpDate: "2026-12-01T10:00:00" }],
    ["a null status", { status: null }],
    ["an unknown status", { status: "HIRED" }],
  ])("400s on %s without calling the service", async (_label, body) => {
    const res = await patch(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty("error");
    expect(updateApplication).not.toHaveBeenCalled();
  });

  it("does not echo a rejected note in the response", async () => {
    const res = await patch({ notes: NOTE, bogus: NOTE });
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain(NOTE);
  });

  it("passes only the fields that were sent, scoped to the session's workspace", async () => {
    const res = await patch({ notes: null, status: "APPLIED" });
    expect(res.status).toBe(200);
    expect(updateApplication).toHaveBeenCalledWith("ws-1", "app-1", { notes: null, status: "APPLIED" });
  });

  it("passes a validated Date for followUpDate", async () => {
    await patch({ followUpDate: "2026-12-01" });
    expect(updateApplication).toHaveBeenCalledWith("ws-1", "app-1", { followUpDate: new Date("2026-12-01T00:00:00Z") });
  });

  it("clears followUpDate with null", async () => {
    await patch({ followUpDate: null });
    expect(updateApplication).toHaveBeenCalledWith("ws-1", "app-1", { followUpDate: null });
  });

  it("does not leak database errors for a follow-up date", async () => {
    updateApplication.mockRejectedValue(new Error("PrismaClientKnownRequestError: invalid datetime"));
    const res = await patch({ followUpDate: "2026-12-01" });
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("Prisma");
  });

  it("404s when the application is not in this workspace", async () => {
    updateApplication.mockRejectedValue(new ApplicationNotFoundError());
    const res = await patch({ notes: "x" }, "someone-elses-app");
    expect(res.status).toBe(404);
  });

  it("500s as JSON on an unexpected failure and logs no note text", async () => {
    updateApplication.mockRejectedValue(new Error(`db exploded while writing ${NOTE}`));
    const res = await patch({ notes: NOTE });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Could not save the change." });
    expect(logError).toHaveBeenCalledTimes(1);
    const [event, , context] = logError.mock.calls[0];
    expect(event).toBe("application.update.failed");
    expect(JSON.stringify(context)).not.toContain(NOTE);
  });
});
