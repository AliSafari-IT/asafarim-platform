import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Each test decides how the parsers behave: a normal parse, or one that
// never finishes (the pathological-document case from #528).
const pdfMock = vi.hoisted(() => ({ getDocumentProxy: vi.fn() }));
const mammothMock = vi.hoisted(() => ({ extractRawText: vi.fn() }));

vi.mock("unpdf", () => pdfMock);
vi.mock("mammoth", () => ({ default: mammothMock, ...mammothMock }));

import { EXTRACTION_TIMEOUT_MS, extractText } from "./text";

const PDF = "application/pdf";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const CV_LINE = "Senior engineer with ten years of TypeScript, Postgres and platform work. ";
const CV_TEXT = CV_LINE.repeat(4);

function fakePdf(pageCount: number, getPage: (n: number) => Promise<unknown>) {
  const destroy = vi.fn(async () => {});
  return { numPages: pageCount, getPage, loadingTask: { destroy }, destroy };
}

function textPage(text: string) {
  return {
    getViewport: () => ({ width: 600 }),
    getTextContent: async () => ({
      items: [
        {
          str: text,
          transform: [10, 0, 0, 10, 50, 700],
          width: 500,
          height: 10,
        },
      ],
    }),
  };
}

const never = () => new Promise<never>(() => {});

beforeEach(() => {
  vi.useFakeTimers();
  pdfMock.getDocumentProxy.mockReset();
  mammothMock.extractRawText.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("extractText parse deadline (#528)", () => {
  it("stays below the upload route's 60s ceiling", () => {
    expect(EXTRACTION_TIMEOUT_MS).toBeGreaterThanOrEqual(5_000);
    expect(EXTRACTION_TIMEOUT_MS).toBeLessThan(60_000);
  });

  it("returns a clean failure when PDF parsing never finishes", async () => {
    pdfMock.getDocumentProxy.mockImplementation(never);
    const result = extractText(new Uint8Array([1]), PDF);
    await vi.advanceTimersByTimeAsync(EXTRACTION_TIMEOUT_MS);
    await expect(result).resolves.toEqual({
      ok: false,
      reasonCode: "EXTRACTION_ERROR",
    });
  });

  it("returns a clean failure when one page never finishes, and frees the document", async () => {
    const pdf = fakePdf(3, async (n) => (n === 2 ? never() : textPage(CV_TEXT)));
    pdfMock.getDocumentProxy.mockResolvedValue(pdf);
    const result = extractText(new Uint8Array([1]), PDF);
    await vi.advanceTimersByTimeAsync(EXTRACTION_TIMEOUT_MS);
    await expect(result).resolves.toEqual({
      ok: false,
      reasonCode: "EXTRACTION_ERROR",
    });
    // The stuck page read never settles, so only the deadline can free it.
    expect(pdf.loadingTask.destroy).toHaveBeenCalled();
  });

  it("stops reading pages once the deadline has passed", async () => {
    let reads = 0;
    const pdf = fakePdf(1_000, async () => {
      reads += 1;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      return textPage(CV_TEXT);
    });
    pdfMock.getDocumentProxy.mockResolvedValue(pdf);
    const result = extractText(new Uint8Array([1]), PDF);
    await vi.advanceTimersByTimeAsync(EXTRACTION_TIMEOUT_MS);
    await expect(result).resolves.toEqual({
      ok: false,
      reasonCode: "EXTRACTION_ERROR",
    });
    const readsAtDeadline = reads;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(reads).toBeLessThanOrEqual(readsAtDeadline + 1);
    expect(pdf.destroy).toHaveBeenCalled();
  });

  it("returns a clean failure when DOCX parsing never finishes", async () => {
    mammothMock.extractRawText.mockImplementation(never);
    const result = extractText(new Uint8Array([1]), DOCX);
    await vi.advanceTimersByTimeAsync(EXTRACTION_TIMEOUT_MS);
    await expect(result).resolves.toEqual({
      ok: false,
      reasonCode: "EXTRACTION_ERROR",
    });
  });

  it("still extracts a normal multi-page PDF and leaves no timer behind", async () => {
    const pdf = fakePdf(5, async () => textPage(CV_TEXT));
    pdfMock.getDocumentProxy.mockResolvedValue(pdf);
    const result = await extractText(new Uint8Array([1]), PDF);
    expect(result.ok).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(pdf.destroy).toHaveBeenCalled();
  });

  it("still extracts a normal DOCX", async () => {
    mammothMock.extractRawText.mockResolvedValue({
      value: CV_TEXT,
      messages: [],
    });
    const result = await extractText(new Uint8Array([1]), DOCX);
    expect(result).toMatchObject({ ok: true });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a parser that fails after the deadline does not surface as an unhandled rejection", async () => {
    mammothMock.extractRawText.mockImplementation(
      () =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("late")), EXTRACTION_TIMEOUT_MS + 5_000),
        ),
    );
    const result = extractText(new Uint8Array([1]), DOCX);
    await vi.advanceTimersByTimeAsync(EXTRACTION_TIMEOUT_MS);
    await expect(result).resolves.toEqual({
      ok: false,
      reasonCode: "EXTRACTION_ERROR",
    });
    await vi.advanceTimersByTimeAsync(10_000);
  });
});
