import { describe, expect, it } from "vitest";
import { checkAttachmentSelection, displayFilename, sniffAttachment, MAX_ATTACHMENT_BYTES } from "./attachments";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...new TextEncoder().encode(p)] : p)));

describe("sniffAttachment", () => {
  it("recognises screenshots, PDFs and saved emails from their bytes", () => {
    expect(sniffAttachment(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]))).toMatchObject({ ok: true, kind: "IMAGE", contentType: "image/png" });
    expect(sniffAttachment(bytes([0xff, 0xd8, 0xff, 0xe0, 0]))).toMatchObject({ ok: true, kind: "IMAGE", contentType: "image/jpeg" });
    expect(sniffAttachment(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 "))).toMatchObject({ ok: true, contentType: "image/webp" });
    expect(sniffAttachment(bytes("%PDF-1.7\n"))).toMatchObject({ ok: true, kind: "PDF" });
    expect(sniffAttachment(bytes("From: Jobs <jobs@example.com>\r\nSubject: Thanks\r\nDate: Fri, 20 Nov 2026 14:31:00 +0100\r\n\r\nHello"))).toMatchObject({
      ok: true,
      kind: "EMAIL",
    });
  });

  it("refuses anything else, whatever it is called", () => {
    expect(sniffAttachment(bytes("<html><script>alert(1)</script>"))).toEqual({ ok: false, reason: "UNSUPPORTED_TYPE" });
    expect(sniffAttachment(bytes("GIF89a"))).toEqual({ ok: false, reason: "UNSUPPORTED_TYPE" });
    expect(sniffAttachment(bytes("Subject: only one header\r\n\r\nbody"))).toEqual({ ok: false, reason: "UNSUPPORTED_TYPE" });
    expect(sniffAttachment(bytes("From: a\r\nSubject: b\r\n", [0], "\r\n"))).toEqual({ ok: false, reason: "UNSUPPORTED_TYPE" });
    expect(sniffAttachment(new Uint8Array())).toEqual({ ok: false, reason: "EMPTY_FILE" });
    expect(sniffAttachment(new Uint8Array(MAX_ATTACHMENT_BYTES + 1))).toEqual({ ok: false, reason: "FILE_TOO_LARGE" });
  });
});

describe("checkAttachmentSelection", () => {
  it("limits count, size and total", () => {
    expect(checkAttachmentSelection([{ size: 10 }])).toBeNull();
    expect(checkAttachmentSelection(Array.from({ length: 6 }, () => ({ size: 1 })))).toBe("TOO_MANY_FILES");
    expect(checkAttachmentSelection([{ size: 1 }], 5)).toBe("TOO_MANY_FILES");
    expect(checkAttachmentSelection([{ size: 0 }])).toBe("EMPTY_FILE");
    expect(checkAttachmentSelection([{ size: MAX_ATTACHMENT_BYTES + 1 }])).toBe("FILE_TOO_LARGE");
    expect(checkAttachmentSelection([{ size: MAX_ATTACHMENT_BYTES }, { size: MAX_ATTACHMENT_BYTES }, { size: 1 }])).toBe("TOTAL_TOO_LARGE");
  });
});

describe("displayFilename", () => {
  it("drops paths and markup characters", () => {
    expect(displayFilename("C:\\Users\\me\\confirm.png", "png")).toBe("confirm.png");
    expect(displayFilename('evil"<x>.pdf', "pdf")).toBe("evilx.pdf");
    expect(displayFilename("", "eml")).toBe("attachment.eml");
  });
});
