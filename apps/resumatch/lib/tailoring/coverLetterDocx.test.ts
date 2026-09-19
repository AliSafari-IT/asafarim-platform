import { describe, expect, it } from "vitest";
import type { CoverLetterContent } from "./ai/coverLetter/schema";
import { renderCoverLetterDocx } from "./coverLetterDocx";

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
});
