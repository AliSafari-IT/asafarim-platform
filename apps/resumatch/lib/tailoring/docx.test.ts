import { describe, expect, it } from "vitest";
import type { TailoredResumeContent } from "./ai/schema";
import { renderTailoredResumeDocx } from "./docx";

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
});
