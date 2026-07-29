import { describe, expect, it } from "vitest";
import {
  containsEmbeddedZipSignature,
  countGifFrames,
  isAnimatedGif,
  looksLikeEncryptedPdf,
  sniffFormat,
  sniffedFormatMatchesDeclaredMime,
} from "./sniff";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function padded(signature: number[] | Buffer, totalLength = 32): Buffer {
  const sig = Buffer.isBuffer(signature) ? signature : Buffer.from(signature);
  const out = Buffer.alloc(totalLength);
  sig.copy(out);
  return out;
}

describe("sniffFormat", () => {
  it("detects a real PNG", () => {
    expect(sniffFormat(PNG_1X1)).toBe("png");
  });

  it("detects JPEG from its magic bytes", () => {
    expect(sniffFormat(padded([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
  });

  it("detects WebP (RIFF....WEBP)", () => {
    const bytes = Buffer.alloc(20);
    bytes.write("RIFF", 0, "ascii");
    bytes.write("WEBP", 8, "ascii");
    expect(sniffFormat(bytes)).toBe("webp");
  });

  it("detects non-animated GIF87a/GIF89a", () => {
    expect(sniffFormat(padded(Buffer.from("GIF89a", "ascii")))).toBe("gif");
    expect(sniffFormat(padded(Buffer.from("GIF87a", "ascii")))).toBe("gif");
  });

  it("detects PDF", () => {
    expect(sniffFormat(padded(Buffer.from("%PDF-1.4", "ascii")))).toBe("pdf");
  });

  it("detects plain UTF-8 text", () => {
    expect(sniffFormat(Buffer.from("hello, world", "utf8"))).toBe("text");
  });

  it("returns null for a null-byte-containing binary blob that matches no signature", () => {
    expect(sniffFormat(Buffer.from([0x00, 0x01, 0x02, 0x03]))).toBeNull();
  });

  it("returns null for a zip local-file-header (archives are never in the allowlist)", () => {
    expect(sniffFormat(padded([0x50, 0x4b, 0x03, 0x04]))).toBeNull();
  });
});

describe("sniffedFormatMatchesDeclaredMime", () => {
  it("matches each binary format to exactly its own canonical MIME", () => {
    expect(sniffedFormatMatchesDeclaredMime("png", "image/png")).toBe(true);
    expect(sniffedFormatMatchesDeclaredMime("png", "image/jpeg")).toBe(false);
    expect(sniffedFormatMatchesDeclaredMime("pdf", "application/pdf")).toBe(true);
  });

  it("accepts any text-category declared MIME for sniffed text", () => {
    for (const mime of ["text/plain", "text/markdown", "application/json", "text/csv"]) {
      expect(sniffedFormatMatchesDeclaredMime("text", mime)).toBe(true);
    }
    expect(sniffedFormatMatchesDeclaredMime("text", "image/png")).toBe(false);
  });
});

describe("containsEmbeddedZipSignature (polyglot defense)", () => {
  it("detects a zip local-file-header signature appended after valid image bytes", () => {
    const polyglot = Buffer.concat([PNG_1X1, Buffer.from([0x50, 0x4b, 0x03, 0x04])]);
    expect(containsEmbeddedZipSignature(polyglot)).toBe(true);
  });

  it("is false for a clean PNG with no embedded archive", () => {
    expect(containsEmbeddedZipSignature(PNG_1X1)).toBe(false);
  });
});

describe("looksLikeEncryptedPdf", () => {
  it("detects an /Encrypt trailer entry near the end of the file", () => {
    const bytes = Buffer.from(`%PDF-1.4\n...\ntrailer\n<< /Root 1 0 R /Encrypt 5 0 R >>\n%%EOF`, "ascii");
    expect(looksLikeEncryptedPdf(bytes)).toBe(true);
  });

  it("is false for a plain PDF with no /Encrypt entry", () => {
    const bytes = Buffer.from(`%PDF-1.4\n...\ntrailer\n<< /Root 1 0 R >>\n%%EOF`, "ascii");
    expect(looksLikeEncryptedPdf(bytes)).toBe(false);
  });
});

describe("GIF animation detection", () => {
  function gifWithFrames(frameCount: number): Buffer {
    const header = Buffer.from("GIF89a", "ascii");
    const screenDescriptor = Buffer.alloc(7); // pad up to the frame-scan start offset (13)
    const frames = Buffer.alloc(frameCount, 0x2c);
    return Buffer.concat([header, screenDescriptor, frames]);
  }

  it("counts a single image-descriptor block as non-animated", () => {
    const single = gifWithFrames(1);
    expect(countGifFrames(single)).toBe(1);
    expect(isAnimatedGif(single)).toBe(false);
  });

  it("flags multiple image-descriptor blocks as animated", () => {
    const multi = gifWithFrames(3);
    expect(isAnimatedGif(multi)).toBe(true);
  });
});
