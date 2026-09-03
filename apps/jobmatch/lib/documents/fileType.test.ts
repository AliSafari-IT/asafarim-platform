import { describe, expect, it } from "vitest";
import { MAX_DOCUMENT_BYTES, safeDisplayFilename, validateUpload } from "./fileType";

const encoder = new TextEncoder();

function bytes(...parts: (string | number[])[]): Uint8Array {
  const chunks = parts.map((p) => (typeof p === "string" ? encoder.encode(p) : Uint8Array.from(p)));
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

const pdf = () => bytes("%PDF-1.7\n", "some page content stream");
const docx = () => bytes([0x50, 0x4b, 0x03, 0x04], "....word/document.xml....");

describe("upload validation", () => {
  it("accepts the three supported formats", () => {
    expect(validateUpload(pdf(), "application/pdf")).toMatchObject({
      ok: true,
      contentType: "application/pdf",
    });
    expect(validateUpload(docx(), null)).toMatchObject({ ok: true, extension: "docx" });
    expect(validateUpload(bytes("Curriculum Vitae\nAli"), "text/plain")).toMatchObject({
      ok: true,
      contentType: "text/plain",
    });
  });

  it("ignores the declared type and trusts the bytes", () => {
    // A PDF announced as a Word document is still a PDF downstream.
    const result = validateUpload(pdf(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(result).toMatchObject({ ok: true, contentType: "application/pdf", declaredMismatch: true });
  });

  it("rejects a renamed archive that is not actually a docx", () => {
    // A JAR, an XLSX, and a zip bomb all start with PK\x03\x04. Requiring
    // the OOXML word part is what keeps them away from a Word parser.
    const jar = bytes([0x50, 0x4b, 0x03, 0x04], "....META-INF/MANIFEST.MF....");
    expect(validateUpload(jar, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toEqual({
      ok: false,
      reason: "UNSUPPORTED_TYPE",
    });
  });

  it("rejects an executable regardless of what it claims to be", () => {
    const elf = bytes([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
    expect(validateUpload(elf, "application/pdf")).toEqual({ ok: false, reason: "UNSUPPORTED_TYPE" });
  });

  it("rejects an empty file with its own reason", () => {
    expect(validateUpload(new Uint8Array(0), "application/pdf")).toEqual({
      ok: false,
      reason: "EMPTY_FILE",
    });
  });

  it("detects an encrypted PDF up front rather than failing in a worker", () => {
    const encrypted = bytes("%PDF-1.7\n", "body", "\ntrailer<< /Encrypt 12 0 R >>");
    expect(validateUpload(encrypted, "application/pdf")).toEqual({
      ok: false,
      reason: "ENCRYPTED_DOCUMENT",
    });
  });

  it("enforces the size cap before doing any content work", () => {
    const huge = new Uint8Array(MAX_DOCUMENT_BYTES + 1);
    expect(validateUpload(huge, "application/pdf")).toEqual({ ok: false, reason: "FILE_TOO_LARGE" });
  });

  it("rejects binary that merely lacks a known signature", () => {
    expect(validateUpload(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00]), "image/jpeg")).toEqual({
      ok: false,
      reason: "UNSUPPORTED_TYPE",
    });
  });
});

describe("display filename", () => {
  it("strips directory components", () => {
    expect(safeDisplayFilename("../../etc/passwd")).toBe("passwd");
    expect(safeDisplayFilename("C:\\Users\\ali\\cv.pdf")).toBe("cv.pdf");
  });

  it("strips control characters that would corrupt a log line or the UI", () => {
    expect(safeDisplayFilename("cv\r\n\u0000.pdf")).toBe("cv.pdf");
  });

  it("bounds the length", () => {
    expect(safeDisplayFilename("a".repeat(500))).toHaveLength(200);
  });

  it("never returns an empty name", () => {
    expect(safeDisplayFilename("")).toBe("document");
    expect(safeDisplayFilename("///")).toBe("document");
  });
});

describe("text validation over the whole file", () => {
  it("rejects a file that is clean UTF-8 for the first 8 KB and binary after", () => {
    // Trivial to construct, and a leading-sample check would have accepted
    // it and handed the extractor something it cannot read.
    const head = encoder.encode("Curriculum Vitae\n".repeat(600));
    const tail = Uint8Array.from([0xff, 0xfe, 0x00, 0x80, 0x81]);
    const file = new Uint8Array(head.length + tail.length);
    file.set(head, 0);
    file.set(tail, head.length);

    expect(file.length).toBeGreaterThan(8192);
    expect(validateUpload(file, "text/plain")).toEqual({ ok: false, reason: "UNSUPPORTED_TYPE" });
  });

  it("still accepts a large, entirely valid text file", () => {
    const file = encoder.encode("Curriculum Vitae\n".repeat(1000));
    expect(validateUpload(file, "text/plain")).toMatchObject({ ok: true, contentType: "text/plain" });
  });
});
