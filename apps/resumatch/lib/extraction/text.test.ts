import { Document, Packer, Paragraph } from "docx";
import { describe, expect, it } from "vitest";
import { runParser } from "./parseWorker";
import { EXTRACTION_TIMEOUT_MS, extractText } from "./text";

// These tests run the real parsers in the real worker thread: the point of
// #528 part 2 is that the worker can be killed, which a mocked parser on the
// calling thread could never show.

const PDF = "application/pdf";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const CV_LINE = "Senior engineer with ten years of TypeScript, Postgres and platform work.";

/**
 * A minimal but valid PDF with one line of Helvetica text per page. Written
 * by hand so the test needs no PDF library; the xref offsets are exact.
 */
function buildPdf(pages: string[][]): Uint8Array {
  const objects: string[] = [];
  const pageIds: number[] = [];
  // 1: catalog, 2: pages tree, 3: font; page/content pairs follow.
  let next = 4;
  const body: Record<number, string> = {
    1: "<< /Type /Catalog /Pages 2 0 R >>",
    3: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  };
  for (const lines of pages) {
    const pageId = next++;
    const contentId = next++;
    pageIds.push(pageId);
    const ops = lines
      .map((line, i) => `BT /F1 11 Tf 50 ${760 - i * 16} Td (${line.replace(/[()\\]/g, "")}) Tj ET`)
      .join("\n");
    body[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    body[contentId] = `<< /Length ${Buffer.byteLength(ops)} >>\nstream\n${ops}\nendstream`;
  }
  body[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < next; id += 1) {
    offsets[id] = Buffer.byteLength(out);
    objects.push(body[id]);
    out += `${id} 0 obj\n${body[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${next}\n0000000000 65535 f \n`;
  for (let id = 1; id < next; id += 1) out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${next} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}

async function buildDocx(paragraphs: string[]): Promise<Uint8Array> {
  const doc = new Document({ sections: [{ children: paragraphs.map((text) => new Paragraph(text)) }] });
  return new Uint8Array(await Packer.toBuffer(doc));
}

describe("extractText parse deadline (#528)", () => {
  it("stays below the upload route's 60s ceiling", () => {
    expect(EXTRACTION_TIMEOUT_MS).toBeGreaterThanOrEqual(5_000);
    expect(EXTRACTION_TIMEOUT_MS).toBeLessThan(60_000);
  });

  it("extracts a long multi-page PDF well within the deadline", async () => {
    const pages = Array.from({ length: 12 }, (_, p) =>
      Array.from({ length: 40 }, (_, l) => `Page ${p + 1} line ${l + 1}: ${CV_LINE}`),
    );
    const started = Date.now();
    const result = await extractText(buildPdf(pages), PDF);
    const elapsed = Date.now() - started;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toContain("Page 1 line 1:");
    expect(result.text).toContain("Page 12 line 40:");
    // Reading order survives the trip through the worker.
    expect(result.text.indexOf("Page 3 line 1:")).toBeLessThan(result.text.indexOf("Page 4 line 1:"));
    expect(elapsed).toBeLessThan(EXTRACTION_TIMEOUT_MS / 2);
  }, 30_000);

  it("extracts a DOCX", async () => {
    const bytes = await buildDocx(Array.from({ length: 30 }, (_, i) => `${i + 1}. ${CV_LINE}`));
    const result = await extractText(bytes, DOCX);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toContain("30. Senior engineer");
  }, 30_000);

  it("returns a clean failure for a corrupt PDF and a corrupt DOCX", async () => {
    const junk = new Uint8Array(Buffer.from("%PDF-1.7\nthis is not really a pdf at all"));
    await expect(extractText(junk, PDF)).resolves.toEqual({ ok: false, reasonCode: "EXTRACTION_ERROR" });
    await expect(extractText(junk, DOCX)).resolves.toEqual({ ok: false, reasonCode: "EXTRACTION_ERROR" });
  }, 30_000);

  it("does not consume the caller's bytes", async () => {
    const bytes = buildPdf([[CV_LINE, CV_LINE]]);
    const length = bytes.byteLength;
    await extractText(bytes, PDF);
    expect(bytes.byteLength).toBe(length);
  }, 30_000);
});

describe("runParser worker thread (#528 part 2)", () => {
  it("kills a parser stuck in a synchronous loop that never yields", async () => {
    // The case part 1 could not cover: no await, so no deadline on the
    // calling thread could ever interrupt it. If the worker were not
    // terminated, this test (and the process) would hang.
    const started = Date.now();
    const result = await runParser("pdf", new Uint8Array([1]), {
      timeoutMs: 500,
      source: "for (;;) {}",
    });
    expect(result).toEqual({ ok: false, reason: "timeout" });
    expect(Date.now() - started).toBeLessThan(5_000);
  }, 10_000);

  it("stops a parser that exhausts its heap without taking the server down", async () => {
    const result = await runParser("pdf", new Uint8Array([1]), {
      timeoutMs: 20_000,
      maxHeapMb: 32,
      source: "const hog = []; for (;;) hog.push(new Array(100000).fill(Math.random()));",
    });
    expect(result).toEqual({ ok: false, reason: "memory" });
  }, 30_000);

  it("treats a worker that exits without an answer as a failure", async () => {
    const result = await runParser("docx", new Uint8Array([1]), { timeoutMs: 5_000, source: "process.exit(0)" });
    expect(result).toEqual({ ok: false, reason: "failed" });
  });

  it("rejects a malformed answer from the worker", async () => {
    const result = await runParser("pdf", new Uint8Array([1]), {
      timeoutMs: 5_000,
      source: `require("node:worker_threads").parentPort.postMessage({ ok: true, kind: "pdf", pages: "nope" })`,
    });
    expect(result).toEqual({ ok: false, reason: "failed" });
  });
});

describe("extractText after the worker (#953 review)", () => {
  it("lays out a page with more text runs than a call can take as arguments", async () => {
    // 200k runs on one page: Math.min(...xs) threw RangeError here before.
    const items = Array.from({ length: 200_000 }, (_, i) => ({
      text: `w${i}`,
      x: 50 + (i % 400),
      y: 700 - Math.floor(i / 400),
      width: 1,
      height: 1,
    }));
    const { reconstructReadingOrder } = await import("./pdfLayout");
    expect(() => reconstructReadingOrder([{ items, width: 612 }])).not.toThrow();
  }, 30_000);
});
