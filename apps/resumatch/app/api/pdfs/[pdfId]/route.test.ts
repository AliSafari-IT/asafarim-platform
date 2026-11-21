import { beforeEach, describe, expect, it, vi } from "vitest";

const readPdfBytes = vi.fn();
const getCurrentWorkspace = vi.fn();
vi.mock("../../../../lib/documentPdfs/service", () => ({ readPdfBytes: (...a: unknown[]) => readPdfBytes(...a) }));
vi.mock("../../../../lib/workspace", () => ({ getCurrentWorkspace: () => getCurrentWorkspace() }));

import { GET } from "./route";

const get = (query = "", pdfId = "pdf-1") => GET(new Request(`http://localhost/api/pdfs/${pdfId}${query}`), { params: Promise.resolve({ pdfId }) });

beforeEach(() => {
  readPdfBytes.mockReset();
  getCurrentWorkspace.mockReset().mockResolvedValue({ id: "ws-1" });
});

describe("GET /api/pdfs/[pdfId]", () => {
  it("401s without a workspace", async () => {
    getCurrentWorkspace.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
    expect(readPdfBytes).not.toHaveBeenCalled();
  });
  it("reads only inside the caller's workspace and 404s otherwise", async () => {
    readPdfBytes.mockResolvedValue({ ok: false, reason: "not_found" });
    expect((await get()).status).toBe(404);
    expect(readPdfBytes).toHaveBeenCalledWith("ws-1", "pdf-1");
  });
  it("never serves bytes that fail their hash check", async () => {
    readPdfBytes.mockResolvedValue({ ok: false, reason: "tampered" });
    expect((await get()).status).toBe(410);
  });
  it("serves privately, inline or as a download", async () => {
    readPdfBytes.mockResolvedValue({ ok: true, pdf: { filename: "Robin – CV.pdf" }, bytes: new TextEncoder().encode("%PDF-1.7") });
    const inline = await get();
    expect(inline.headers.get("content-type")).toBe("application/pdf");
    expect(inline.headers.get("cache-control")).toBe("private, no-store");
    expect(inline.headers.get("content-disposition")).toMatch(/^inline;/);
    expect((await get("?download=1")).headers.get("content-disposition")).toMatch(/^attachment;/);
  });
});
