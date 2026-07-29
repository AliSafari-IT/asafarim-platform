import { describe, expect, it } from "vitest";
import { acceptAttribute, declaredTypeFor, formatBytes, validateCandidate } from "./attachmentDraft";
import type { AttachmentPolicy } from "./types";

/**
 * The composer's client-side validation. Every rule here is a courtesy
 * layer over the server's own enforcement (lib/repositories/attachments.ts),
 * so these tests exist to prove it fails FAST and SPECIFICALLY — never to
 * prove it is what keeps a bad file out.
 *
 * The policy is deliberately a fabricated one rather than the real
 * catalogue: it proves the composer reads whatever the server sends (M13's
 * "the client keeps no divergent allowlist") instead of agreeing with the
 * production numbers by coincidence.
 */
const POLICY: AttachmentPolicy = {
  types: [
    { mimeType: "image/png", category: "image", maxBytes: 1_000 },
    { mimeType: "image/jpeg", category: "image", maxBytes: 1_000 },
    { mimeType: "text/csv", category: "text", maxBytes: 500 },
    { mimeType: "application/pdf", category: "pdf", maxBytes: 2_000 },
  ],
  maxAttachmentsPerMessage: 3,
  maxFilenameLength: 20,
};

function file(name: string, size: number, type = ""): Pick<File, "name" | "size" | "type"> {
  return { name, size, type };
}

describe("declaredTypeFor", () => {
  it("trusts the browser's type when it is one the server accepts", () => {
    expect(declaredTypeFor(file("photo.png", 10, "image/png"), POLICY)).toBe("image/png");
  });

  it("falls back to the extension when the browser reports nothing", () => {
    // Chrome reports "" for .md and for many drag/drop sources.
    expect(declaredTypeFor(file("notes.csv", 10, ""), POLICY)).toBe("text/csv");
    expect(declaredTypeFor(file("photo.JPG", 10, ""), POLICY)).toBe("image/jpeg");
  });

  it("falls back to the extension when the browser reports a type the server does not accept", () => {
    // e.g. Windows reporting "application/vnd.ms-excel" for a .csv — the
    // extension is the better guess, and the server sniffs the bytes anyway.
    expect(declaredTypeFor(file("data.csv", 10, "application/vnd.ms-excel"), POLICY)).toBe("text/csv");
  });

  it("leaves an unrecognized file with a type validation will reject", () => {
    expect(declaredTypeFor(file("payload.exe", 10, "application/x-msdownload"), POLICY)).toBe("application/x-msdownload");
  });
});

describe("validateCandidate", () => {
  it("accepts a supported file within its per-type limit", () => {
    expect(validateCandidate(file("photo.png", 900), "image/png", POLICY, 0)).toBeNull();
  });

  it("rejects an unsupported type", () => {
    const failure = validateCandidate(file("payload.exe", 10), "application/x-msdownload", POLICY, 0);
    expect(failure?.code).toBe("unsupported_type");
  });

  it("rejects a file over the limit for ITS OWN category, not a global limit", () => {
    // 900 bytes is fine as a PNG (1,000 limit) but too large as a CSV (500).
    expect(validateCandidate(file("photo.png", 900), "image/png", POLICY, 0)).toBeNull();
    const failure = validateCandidate(file("data.csv", 900), "text/csv", POLICY, 0);
    expect(failure?.code).toBe("too_large");
    expect(failure?.message).toContain("500 bytes");
  });

  it("rejects an empty file", () => {
    expect(validateCandidate(file("empty.png", 0), "image/png", POLICY, 0)?.code).toBe("empty_file");
  });

  it("rejects once the message already holds the server's maximum attachments", () => {
    expect(validateCandidate(file("photo.png", 10), "image/png", POLICY, 2)).toBeNull();
    const failure = validateCandidate(file("photo.png", 10), "image/png", POLICY, 3);
    expect(failure?.code).toBe("too_many");
    expect(failure?.message).toContain("3");
  });

  it("rejects a filename longer than the server will store", () => {
    const failure = validateCandidate(file(`${"a".repeat(25)}.png`, 10), "image/png", POLICY, 0);
    expect(failure?.code).toBe("filename_too_long");
  });

  it("reports the limit from the policy it was handed, not a hardcoded one", () => {
    const generous: AttachmentPolicy = { ...POLICY, types: [{ mimeType: "image/png", category: "image", maxBytes: 50_000 }] };
    expect(validateCandidate(file("photo.png", 40_000), "image/png", generous, 0)).toBeNull();
  });
});

describe("acceptAttribute", () => {
  it("derives the picker's filter from the server catalogue", () => {
    expect(acceptAttribute(POLICY)).toBe("image/png,image/jpeg,text/csv,application/pdf");
  });
});

describe("formatBytes", () => {
  it("scales units so a chip never reads '10485760 bytes'", () => {
    expect(formatBytes(512)).toBe("512 bytes");
    expect(formatBytes(2_048)).toBe("2KB");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10MB");
  });
});
