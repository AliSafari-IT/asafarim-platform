import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { CoverLetterContent } from "./ai/coverLetter/schema";
import { renderCoverLetterDocx } from "./coverLetterDocx";

/** One part of the DOCX zip, by name — walks the local file headers (the
 *  docx package writes sizes there, no data descriptors). */
function zipEntry(buffer: Buffer, name: string): string | null {
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const start = offset + 30 + nameLength + extraLength;
    if (buffer.subarray(offset + 30, offset + 30 + nameLength).toString() === name) {
      const data = buffer.subarray(start, start + size);
      return (method === 8 ? inflateRawSync(data) : data).toString("utf8");
    }
    offset = start + size;
  }
  return null;
}

function content(overrides: Partial<CoverLetterContent> = {}): CoverLetterContent {
  return {
    contractVersion: "1.0.0",
    greeting: "Dear Hiring Manager,",
    paragraphs: [
      "I am excited to apply for the Backend Engineer role at Acme.",
      "My six years of experience with Node.js and PostgreSQL match your team's needs.",
    ],
    signOff: "Sincerely,",
    fullName: "Jane Doe",
    ...overrides,
  };
}

describe("renderCoverLetterDocx", () => {
  it("produces a non-empty DOCX buffer", async () => {
    const buffer = await renderCoverLetterDocx(content());
    expect(buffer.length).toBeGreaterThan(0);
    // DOCX files are zip archives — PK magic bytes.
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it("renders for a letter with no confirmed name", async () => {
    const buffer = await renderCoverLetterDocx(content({ fullName: null }));
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("renders for a single-paragraph letter", async () => {
    const buffer = await renderCoverLetterDocx(content({ paragraphs: ["A single short paragraph."] }));
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("sets the proofing language to the letter's language (#642)", async () => {
    const buffer = await renderCoverLetterDocx(
      content({ greeting: "Madame, Monsieur,", signOff: "Veuillez agréer mes salutations distinguées." }),
      "fr",
    );
    expect(zipEntry(buffer, "word/styles.xml")).toContain('w:val="fr-BE"');
    expect(zipEntry(buffer, "word/document.xml")).toContain("Madame, Monsieur,");
  });

  it("sets no proofing language for a letter with none recorded", async () => {
    const styles = zipEntry(await renderCoverLetterDocx(content()), "word/styles.xml");
    expect(styles).not.toBeNull();
    expect(styles).not.toMatch(/<w:lang /);
  });
});
