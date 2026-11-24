import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentWorkspace = vi.fn();
const uploadDocument = vi.fn();
const extractDocument = vi.fn();
vi.mock("../../../lib/workspace", () => ({ getCurrentWorkspace: () => getCurrentWorkspace() }));
vi.mock("../../../lib/documents/service", () => ({
  uploadDocument: (...a: unknown[]) => uploadDocument(...a),
  extractDocument: (...a: unknown[]) => extractDocument(...a),
  listDocuments: vi.fn(),
  shouldCallExtractionAgain: () => false,
}));
vi.mock("../../../lib/observability/logger", () => ({ logError: vi.fn() }));

import { POST } from "./route";

const upload = (text: string, name: string) => {
  const form = new FormData();
  form.set("file", new File([text], name, { type: "text/plain" }));
  return POST(new Request("http://localhost/api/documents", { method: "POST", body: form }));
};

beforeEach(() => {
  getCurrentWorkspace.mockReset().mockResolvedValue({ id: "ws-1" });
  uploadDocument.mockReset().mockResolvedValue({ ok: true, documentId: "d1", status: "CLEAN" });
  extractDocument.mockReset().mockResolvedValue({ ok: true, versionId: "v1" });
});

describe("POST /api/documents (#942)", () => {
  it("refuses a ResuMatch export, even renamed, before storing or extracting it", async () => {
    const archive = JSON.stringify({ format: "resumatch-candidate-export", formatVersion: "1.0.0", profile: null });
    const response = await upload(archive, "my-cv.txt");
    expect(response.status).toBe(422);
    expect((await response.json()).reasonCode).toBe("NATIVE_EXPORT");
    expect(uploadDocument).not.toHaveBeenCalled();
    expect(extractDocument).not.toHaveBeenCalled();
  });

  it("still reads a plain-text CV", async () => {
    const response = await upload("Jordan Example\nSoftware developer\nExperience: ...", "cv.txt");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "EXTRACTED", versionId: "v1" });
    expect(uploadDocument).toHaveBeenCalledOnce();
  });
});
