import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendApplicationEmail = vi.fn();
const getCurrentWorkspace = vi.fn();
const getSessionAccountInfo = vi.fn();
const logError = vi.fn();

vi.mock("../../../../../lib/applicationEmail/service", () => ({ sendApplicationEmail: (...a: unknown[]) => sendApplicationEmail(...a) }));
vi.mock("../../../../../lib/workspace", () => ({
  getCurrentWorkspace: () => getCurrentWorkspace(),
  getSessionAccountInfo: () => getSessionAccountInfo(),
}));
vi.mock("../../../../../lib/observability/logger", () => ({ logError: (...a: unknown[]) => logError(...a) }));

import { POST } from "./route";

const DRAFT = {
  toEmail: "jobs@acme.example",
  contactName: "",
  subject: "Application",
  body: "Private message body",
  subjectEdited: false,
  bodyEdited: false,
  sendCopyToSelf: true,
  cvPdfId: "pdf-cv",
  coverLetterPdfId: "pdf-letter",
  version: 1,
};
const KEY = randomUUID();

const post = (body: unknown, id = "app-1") =>
  POST(
    new Request(`http://localhost/api/applications/${id}/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

beforeEach(() => {
  sendApplicationEmail.mockReset();
  getCurrentWorkspace.mockReset().mockResolvedValue({ id: "ws-1" });
  getSessionAccountInfo.mockReset().mockResolvedValue({ email: "me@example.test", fullName: "Robin" });
  logError.mockReset();
});

describe("POST /api/applications/[id]/send", () => {
  it("401s without a workspace and sends nothing", async () => {
    getCurrentWorkspace.mockResolvedValue(null);
    expect((await post({ draft: DRAFT, idempotencyKey: KEY })).status).toBe(401);
    expect(sendApplicationEmail).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid JSON", "{nope"],
    ["no idempotency key", { draft: DRAFT }],
    ["a key that is not a UUID", { draft: DRAFT, idempotencyKey: "1" }],
    ["an extra draft field", { draft: { ...DRAFT, from: "ceo@acme.example" }, idempotencyKey: KEY }],
    ["a header line break", { draft: { ...DRAFT, subject: "Hi\r\nBcc: x@y.example" }, idempotencyKey: KEY }],
  ])("400s on %s without sending", async (_label, body) => {
    expect((await post(body)).status).toBe(400);
    expect(sendApplicationEmail).not.toHaveBeenCalled();
  });

  it("sends in the caller's workspace with the session's address as Reply-To", async () => {
    sendApplicationEmail.mockResolvedValue({ outcome: "accepted", sentId: "s1", applicationStatus: "APPLIED", recorded: true, replayed: false, draft: null });
    const res = await post({ draft: DRAFT, idempotencyKey: KEY });
    expect(res.status).toBe(200);
    expect(sendApplicationEmail).toHaveBeenCalledWith("ws-1", "app-1", expect.objectContaining({ idempotencyKey: KEY }), { accountEmail: "me@example.test", accountName: "Robin" });
  });

  it.each([
    ["not_found", 404],
    ["not_configured", 503],
    ["fields", 422],
    ["attachments", 422],
    ["draft_conflict", 409],
    ["unresolved_send", 409],
    ["rate_limited", 429],
  ])("maps %s to %i", async (reason, status) => {
    sendApplicationEmail.mockResolvedValue({ outcome: "invalid", reason });
    expect((await post({ draft: DRAFT, idempotencyKey: KEY })).status).toBe(status);
  });

  it("reports failed and uncertain sends as answers, not errors", async () => {
    sendApplicationEmail.mockResolvedValue({ outcome: "failed", sentId: "s1", errorCode: "SMTP_550", replayed: false, draft: null });
    expect((await post({ draft: DRAFT, idempotencyKey: KEY })).status).toBe(200);
    sendApplicationEmail.mockResolvedValue({ outcome: "in_progress", sentId: "s1" });
    expect((await post({ draft: DRAFT, idempotencyKey: KEY })).status).toBe(409);
  });

  it("never logs the message on an unexpected error", async () => {
    sendApplicationEmail.mockRejectedValue(new Error("db down"));
    const res = await post({ draft: DRAFT, idempotencyKey: KEY });
    expect(res.status).toBe(500);
    expect(JSON.stringify(logError.mock.calls)).not.toContain("Private message body");
    expect(JSON.stringify(logError.mock.calls)).not.toContain("jobs@acme.example");
  });
});
