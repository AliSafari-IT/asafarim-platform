import { beforeEach, describe, expect, it, vi } from "vitest";

const recordExternalSubmission = vi.fn();
const getCurrentWorkspace = vi.fn();
vi.mock("../../../../../lib/applications/timeline/service", () => ({
  recordExternalSubmission: (...a: unknown[]) => recordExternalSubmission(...a),
  editExternalSubmission: vi.fn(),
  undoExternalSubmission: vi.fn(),
}));
vi.mock("../../../../../lib/workspace", () => ({ getCurrentWorkspace: () => getCurrentWorkspace() }));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/applications/app-1/submission", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: "app-1" }),
  });
const valid = { clientKey: "6f1d2c3a-1111-4222-8333-944455556666", appliedAt: { local: "2026-11-20T14:30", timeZone: "Europe/Brussels" }, channel: "LINKEDIN" };

beforeEach(() => {
  recordExternalSubmission.mockReset().mockResolvedValue({ ok: true, replay: false });
  getCurrentWorkspace.mockReset().mockResolvedValue({ id: "ws-1" });
});

describe("POST /api/applications/[id]/submission", () => {
  it("records for the session's workspace with UTC computed on the server", async () => {
    const res = await post(valid);
    expect(res.status).toBe(201);
    const [ws, id, input] = recordExternalSubmission.mock.calls[0];
    expect([ws, id]).toEqual(["ws-1", "app-1"]);
    expect(input.appliedAt.at.toISOString()).toBe("2026-11-20T13:30:00.000Z");
  });

  it("answers a replayed save with 200 and a second recording with 409", async () => {
    recordExternalSubmission.mockResolvedValueOnce({ ok: true, replay: true });
    expect((await post(valid)).status).toBe(200);
    recordExternalSubmission.mockResolvedValueOnce({ ok: false, reason: "already_recorded" });
    expect((await post(valid)).status).toBe(409);
  });

  it("400s on a field it doesn't own, naming it but not echoing values", async () => {
    const res = await post({ ...valid, status: "OFFER", notes: "secret note" });
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain("status");
    expect(body).not.toContain("secret note");
    expect(recordExternalSubmission).not.toHaveBeenCalled();
  });
});
