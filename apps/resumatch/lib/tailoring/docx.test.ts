import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { TailoredResumeContent } from "./ai/schema";
import { renderTailoredResumeDocx } from "./docx";

/** One part of the DOCX zip, by name (same walker as coverLetterDocx.test.ts). */
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

function content(overrides: Partial<TailoredResumeContent> = {}): TailoredResumeContent {
  return {
    contractVersion: "1.0.0",
    fullName: "Jane Doe",
    email: "jane@example.com",
    phone: "+1 555 0100",
    headline: "Backend Engineer",
    summary: "Backend engineer with 6 years of experience.",
    skills: ["Node.js", "PostgreSQL"],
    experience: [
      {
        title: "Senior Engineer",
        employer: "Acme",
        startedOn: "2021-01",
        endedOn: null,
        isCurrent: true,
        bullets: ["Reduced latency by 40%"],
      },
    ],
    education: [{ qualification: "BSc Computer Science", institution: "State University", completedOn: "2016-06" }],
    certifications: [{ name: "AWS Certified", issuer: "AWS", issuedOn: null, expiresOn: null }],
    location: null,
    links: [],
    languages: [],
    ...overrides,
  };
}

describe("renderTailoredResumeDocx", () => {
  it("produces a non-empty DOCX buffer", async () => {
    const buffer = await renderTailoredResumeDocx(content());
    expect(buffer.length).toBeGreaterThan(0);
    // DOCX files are zip archives — PK magic bytes.
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it("renders for minimal content with no experience/education/certifications", async () => {
    const buffer = await renderTailoredResumeDocx(
      content({ experience: [], education: [], certifications: [], skills: [] }),
    );
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("renders location, clickable links, products and languages", async () => {
    const buffer = await renderTailoredResumeDocx(
      content({
        location: "Genk, Belgium",
        links: [
          { kind: "github", label: null, url: "https://github.com/jane" },
          { kind: "product", label: "Example App", url: "https://app.example.test" },
        ],
        languages: [{ code: "nl", label: "Nederlands", proficiency: "native" }],
      }),
      "nl",
    );
    const xml = zipEntry(buffer, "word/document.xml") ?? "";
    const rels = zipEntry(buffer, "word/_rels/document.xml.rels") ?? "";
    expect(xml).toContain("Genk, Belgium");
    expect(xml).toContain("github.com/jane");
    expect(xml).toContain("Projecten &amp; producten");
    expect(xml).toContain("Example App");
    expect(xml).toContain("Nederlands (Moedertaal)");
    expect(xml).toContain("<w:hyperlink");
    expect(rels).toContain("https://github.com/jane");
    expect(rels).toContain("https://app.example.test");
  });
});
