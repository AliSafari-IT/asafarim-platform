import { beforeEach, describe, expect, it, vi } from "vitest";

const readAttachment = vi.fn();
const deleteAttachment = vi.fn();
const getCurrentWorkspace = vi.fn();
vi.mock("../../../../lib/applications/timeline/service", () => ({
  readAttachment: (...a: unknown[]) => readAttachment(...a),
  deleteAttachment: (...a: unknown[]) => deleteAttachment(...a),
}));
vi.mock("../../../../lib/workspace", () => ({ getCurrentWorkspace: () => getCurrentWorkspace() }));

import { DELETE, GET } from "./route";

const params = (attachmentId = "att-1") => ({ params: Promise.resolve({ attachmentId }) });
const get = (search = "") => GET(new Request(`http://localhost/api/application-attachments/att-1${search}`), params());

beforeEach(() => {
  readAttachment.mockReset();
  deleteAttachment.mockReset();
  getCurrentWorkspace.mockReset().mockResolvedValue({ id: "ws-1" });
});

describe("/api/application-attachments/[attachmentId]", () => {
  it("401s without a session and 404s for another workspace's file", async () => {
    getCurrentWorkspace.mockResolvedValueOnce(null);
    expect((await get()).status).toBe(401);
    readAttachment.mockResolvedValue({ ok: false, reason: "not_found" });
    expect((await get()).status).toBe(404);
    expect(readAttachment).toHaveBeenCalledWith("ws-1", "att-1");
    deleteAttachment.mockResolvedValue({ ok: false, reason: "not_found" });
    expect((await DELETE(new Request("http://localhost/x", { method: "DELETE" }), params())).status).toBe(404);
  });

  it("serves a screenshot inline, sandboxed and never sniffed", async () => {
    readAttachment.mockResolvedValue({ ok: true, row: { kind: "IMAGE", contentType: "image/png", filename: "shot.png" }, bytes: new Uint8Array([1, 2]) });
    const res = await get();
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("content-disposition")).toMatch(/^inline/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("only ever downloads a saved email, as plain bytes", async () => {
    readAttachment.mockResolvedValue({ ok: true, row: { kind: "EMAIL", contentType: "message/rfc822", filename: "reply.eml" }, bytes: new Uint8Array([65]) });
    const res = await get();
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment/);
  });
});
