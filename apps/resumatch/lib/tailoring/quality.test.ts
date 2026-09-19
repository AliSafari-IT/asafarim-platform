import { describe, expect, it } from "vitest";
import type { TailoredResumeContent } from "./ai/schema";
import { computeQuality } from "./quality";

function content(overrides: Partial<TailoredResumeContent> = {}): TailoredResumeContent {
  return {
    contractVersion: "1.0.0",
    fullName: "Jane Doe",
    email: "jane@example.com",
    phone: "+1 555 0100",
    headline: "Backend Engineer",
    summary: "Backend engineer with 6 years of experience.",
    skills: ["Node.js", "PostgreSQL", "Kubernetes", "Docker", "AWS"],
    experience: [],
    education: [],
    certifications: [],
    ...overrides,
  };
}

describe("computeQuality", () => {
  it("flags a bullet with no digit as missing a metric", () => {
    const report = computeQuality(
      content({
        experience: [
          {
            title: "Engineer",
            employer: "Acme",
            startedOn: null,
            endedOn: null,
            isCurrent: true,
            bullets: ["Improved system reliability", "Reduced latency by 40%"],
          },
        ],
      }),
    );
    expect(report.totalBullets).toBe(2);
    expect(report.bulletsWithoutMetric).toHaveLength(1);
    expect(report.bulletsWithoutMetric[0].text).toBe("Improved system reliability");
  });

  it("flags a bullet that opens on a weak/passive verb", () => {
    const report = computeQuality(
      content({
        experience: [
          {
            title: "Engineer",
            employer: "Acme",
            startedOn: null,
            endedOn: null,
            isCurrent: true,
            bullets: ["Responsible for deploying 3 services", "Led migration of 12 services"],
          },
        ],
      }),
    );
    expect(report.weakLeadBullets).toHaveLength(1);
    expect(report.weakLeadBullets[0].text).toBe("Responsible for deploying 3 services");
  });

  it("flags a bullet longer than the print-friendly threshold", () => {
    const longBullet = "Shipped a very long bullet point ".repeat(8);
    const report = computeQuality(
      content({
        experience: [
          {
            title: "Engineer",
            employer: "Acme",
            startedOn: null,
            endedOn: null,
            isCurrent: true,
            bullets: [longBullet],
          },
        ],
      }),
    );
    expect(report.overLengthBullets).toHaveLength(1);
  });

  it("lists missing contact/headline/summary fields", () => {
    const report = computeQuality(content({ headline: null, phone: null }));
    expect(report.missingFields).toEqual(["headline", "phone"]);
  });

  it("reports no missing fields when everything is present", () => {
    const report = computeQuality(content());
    expect(report.missingFields).toEqual([]);
  });

  it("flags a low skills count", () => {
    const report = computeQuality(content({ skills: ["Node.js"] }));
    expect(report.skillsCountIsLow).toBe(true);
    expect(report.skillsCountIsHigh).toBe(false);
  });

  it("flags a high skills count", () => {
    const report = computeQuality(content({ skills: Array.from({ length: 30 }, (_, i) => `Skill ${i}`) }));
    expect(report.skillsCountIsHigh).toBe(true);
    expect(report.skillsCountIsLow).toBe(false);
  });

  it("flags neither low nor high for a typical skills count", () => {
    const report = computeQuality(content());
    expect(report.skillsCountIsLow).toBe(false);
    expect(report.skillsCountIsHigh).toBe(false);
  });

  it("returns zero bullets and no flags for an empty experience list", () => {
    const report = computeQuality(content({ experience: [] }));
    expect(report.totalBullets).toBe(0);
    expect(report.bulletsWithoutMetric).toEqual([]);
    expect(report.weakLeadBullets).toEqual([]);
    expect(report.overLengthBullets).toEqual([]);
  });
});
