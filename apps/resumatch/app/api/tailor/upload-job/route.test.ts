import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Upload-job with several files: each is validated, scanned and read on
 * its own, the texts are joined into one job, and any unreadable file
 * stops the job with a per-file answer. Database-free; the byte sniffing
 * and plain-text extraction are the real ones, the scanner is stubbed.
 */

const create = vi.fn();
const openDraft = vi.fn();
const inferJobMetaWithFallback = vi.fn();
const scan = vi.fn();

vi.mock("../../../../lib/workspace", () => ({
  getCurrentWorkspace: async () => ({ id: "ws_1" }),
}));
vi.mock("../../../../lib/db/client", () => ({
  getJobmatchDb: () => ({ targetJob: { create } }),
}));
vi.mock("../../../../lib/tailoring/jobMetaAi/degraded", () => ({
  inferJobMetaWithFallback: (...args: unknown[]) => inferJobMetaWithFallback(...args),
}));
vi.mock("../../../../lib/tailoring/drafts/store", () => ({
  openDraft: (...args: unknown[]) => openDraft(...args),
}));
vi.mock("../../../../lib/documents/scanner", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../lib/documents/scanner")>()),
  createScanner: () => ({ scan: (bytes: Uint8Array) => scan(bytes) }),
}));

const { POST } = await import("./route");

const posting = (label: string) =>
  `${label}: Senior Full-Stack Developer at Contoso in Genk. You build React and Node.js features, ` +
  "review pull requests, write Playwright tests and keep the CI pipeline green. Three years of TypeScript required.";

function upload(files: File[]): Request {
  const form = new FormData();
  for (const file of files) form.append("file", file);
  return new Request("http://localhost/api/tailor/upload-job", { method: "POST", body: form });
}

describe("upload-job with several files", () => {
  beforeEach(() => {
    create.mockReset().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: data.id, status: data.status }));
    openDraft.mockReset().mockResolvedValue(undefined);
    inferJobMetaWithFallback.mockReset().mockResolvedValue({ title: "Senior Full-Stack Developer", employer: "Contoso" });
    scan.mockReset().mockResolvedValue({ outcome: "clean" });
  });

  it("keeps a single file exactly as before", async () => {
    const res = await POST(upload([new File([posting("Vacancy")], "vacancy.txt", { type: "text/plain" })]));
    expect(res.status).toBe(200);
    const data = create.mock.calls[0][0].data;
    expect(data.sourceUrl).toBe("upload://vacancy.txt");
    expect(data.rawText).not.toContain("=== File");
    expect(data.sourceFiles).toEqual([expect.objectContaining({ name: "vacancy.txt", contentType: "text/plain" })]);
    expect(openDraft).toHaveBeenCalledWith("ws_1", data.id);
  });

  it("joins several files into one job, in upload order, each headed by its name", async () => {
    const res = await POST(
      upload([
        new File([posting("Vacancy")], "vacancy.txt", { type: "text/plain" }),
        new File([`# Company\n\n${posting("Company profile")}`], "company.md", { type: "text/markdown" }),
        new File([JSON.stringify({ benefits: posting("Benefits") })], "benefits.json", { type: "application/json" }),
      ]),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    const data = create.mock.calls[0][0].data;
    expect(data.rawText.indexOf("=== File 1 of 3: vacancy.txt ===")).toBe(0);
    expect(data.rawText.indexOf("company.md")).toBeLessThan(data.rawText.indexOf("benefits.json"));
    expect(data.sourceUrl).toBe("upload://vacancy.txt (+2 more)");
    expect(data.sourceFiles.map((f: { name: string }) => f.name)).toEqual(["vacancy.txt", "company.md", "benefits.json"]);
    expect(body.sourceFiles).toEqual([{ name: "vacancy.txt" }, { name: "company.md" }, { name: "benefits.json" }]);
    // One metadata call over the joined text.
    expect(inferJobMetaWithFallback).toHaveBeenCalledTimes(1);
    expect(inferJobMetaWithFallback.mock.calls[0][1]).toBe(data.rawText);
  });

  it("creates no job when one file can't be read, and says which", async () => {
    const res = await POST(
      upload([
        new File([posting("Vacancy")], "vacancy.txt", { type: "text/plain" }),
        new File([new Uint8Array([0, 1, 2, 3, 0, 255])], "photo.bin", { type: "application/octet-stream" }),
        new File(["Too short."], "note.txt", { type: "text/plain" }),
      ]),
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
    expect(openDraft).not.toHaveBeenCalled();
    expect(body.code).toBe("FILES_UNREADABLE");
    expect(body.files).toEqual([
      { name: "vacancy.txt", ok: true },
      expect.objectContaining({ name: "photo.bin", ok: false, code: "UNSUPPORTED_TYPE" }),
      expect.objectContaining({ name: "note.txt", ok: false, code: "NO_TEXT_LAYER" }),
    ]);
  });

  it("a file the scanner can't clear fails on its own", async () => {
    scan.mockResolvedValueOnce({ outcome: "clean" }).mockResolvedValueOnce({ outcome: "infected" });
    const res = await POST(
      upload([
        new File([posting("Vacancy")], "a.txt", { type: "text/plain" }),
        new File([posting("Other")], "b.txt", { type: "text/plain" }),
      ]),
    );
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.files[1]).toEqual(expect.objectContaining({ name: "b.txt", ok: false, code: "MALWARE_DETECTED" }));
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses more than five files before reading any", async () => {
    const files = Array.from({ length: 6 }, (_, i) => new File([posting(`Part ${i}`)], `part-${i}.txt`, { type: "text/plain" }));
    const res = await POST(upload(files));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("TOO_MANY_FILES");
    expect(scan).not.toHaveBeenCalled();
  });

  it("refuses a set larger than 20 MB together before reading any", async () => {
    const big = "a".repeat(7 * 1024 * 1024);
    const files = [0, 1, 2].map((i) => new File([big], `big-${i}.txt`, { type: "text/plain" }));
    const res = await POST(upload(files));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("TOTAL_TOO_LARGE");
    expect(scan).not.toHaveBeenCalled();
  });
});
