import { describe, expect, it } from "vitest";
import { processAttachmentContent } from "./process";
import { AttachmentMismatchError, UnsupportedAttachmentTypeError } from "./errors";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

describe("processAttachmentContent", () => {
  it("accepts a real PNG declared as image/png, extracting nothing (images have no text extraction)", async () => {
    const result = await processAttachmentContent(PNG_1X1, "image/png");
    expect(result.detectedMimeType).toBe("image/png");
    expect(result.extractionKind).toBeNull();
    expect(result.scan.verdict).toBe("not_configured"); // no scanner configured in the test environment
  });

  it("accepts plain text and extracts it, bounded", async () => {
    const result = await processAttachmentContent(Buffer.from("hello", "utf8"), "text/plain");
    expect(result.detectedMimeType).toBe("text/plain");
    expect(result.extractionKind).toBe("plain_text");
    expect(result.extractedText).toBe("hello");
  });

  it("rejects a declared/actual MIME mismatch (PNG bytes declared as text/csv)", async () => {
    await expect(processAttachmentContent(PNG_1X1, "text/csv")).rejects.toBeInstanceOf(AttachmentMismatchError);
  });

  it("rejects an unrecognized binary format", async () => {
    const binary = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]);
    await expect(processAttachmentContent(binary, "image/png")).rejects.toBeInstanceOf(UnsupportedAttachmentTypeError);
  });

  it("rejects a polyglot (image bytes with an embedded zip signature)", async () => {
    const polyglot = Buffer.concat([PNG_1X1, Buffer.from([0x50, 0x4b, 0x03, 0x04])]);
    await expect(processAttachmentContent(polyglot, "image/png")).rejects.toBeInstanceOf(AttachmentMismatchError);
  });

  it("rejects an encrypted PDF", async () => {
    const encryptedPdf = Buffer.from(`%PDF-1.4\ntrailer\n<< /Root 1 0 R /Encrypt 5 0 R >>\n%%EOF`, "ascii");
    await expect(processAttachmentContent(encryptedPdf, "application/pdf")).rejects.toBeInstanceOf(
      UnsupportedAttachmentTypeError,
    );
  });

  it("rejects an animated GIF", async () => {
    const header = Buffer.from("GIF89a", "ascii");
    const screenDescriptor = Buffer.alloc(7);
    const frames = Buffer.alloc(3, 0x2c);
    const animated = Buffer.concat([header, screenDescriptor, frames]);
    await expect(processAttachmentContent(animated, "image/gif")).rejects.toBeInstanceOf(UnsupportedAttachmentTypeError);
  });
});
