import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fetchJobPosting, MIN_USEFUL_CHARACTERS } from "./fetchJob";
import {
  assessFetchQuality,
  boilerplateShare,
  REAL_POSTING_MIN_CHARACTERS,
  STRUCTURED_POSTING_MIN_CHARACTERS,
} from "./fetchQuality";

const fixture = (name: string) =>
  readFileSync(
    path.resolve(__dirname, "../../fixtures/job-postings", name),
    "utf8"
  );

async function fetchHtml(html: string) {
  const fetchImpl = vi
    .fn()
    .mockResolvedValue(
      new Response(html, {
        status: 200,
        headers: { "content-type": "text/html" },
      })
    );
  return fetchJobPosting("https://jobs.example.test/posting/1", fetchImpl);
}

const posting = [
  "Backend Engineer",
  "You will design and build services in TypeScript, model data in PostgreSQL and review your colleagues' code.",
  "We are a team of six engineers who own the ingestion pipeline and the public API for regional energy suppliers.",
  "You bring three or more years of backend development, solid SQL and comfort with Docker and CI pipelines.",
  "We offer a competitive salary, 32 days of leave and a yearly training budget for every engineer on the team.",
  "Good written English is required; Dutch or French is a plus for working with our customers in Belgium.",
].join("\n");

describe("fetch-quality signal on real fetches (#520)", () => {
  it("flags a cookie-wall page that clears MIN_USEFUL_CHARACTERS", async () => {
    const result = await fetchHtml(fixture("cookie-wall.html"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // It is a "successful" fetch by the old bar...
    expect(result.rawText.length).toBeGreaterThanOrEqual(MIN_USEFUL_CHARACTERS);
    // ...but the signal says it says nothing about the role.
    expect(result.quality.looksIncomplete).toBe(true);
    expect(result.quality.reasons).toContain("MOSTLY_BOILERPLATE");
  });

  it("flags a JavaScript loading shell that clears MIN_USEFUL_CHARACTERS", async () => {
    const result = await fetchHtml(fixture("loading-shell.html"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.rawText.length).toBeGreaterThanOrEqual(MIN_USEFUL_CHARACTERS);
    expect(result.quality.looksIncomplete).toBe(true);
    expect(result.quality.reasons).toEqual(
      expect.arrayContaining(["MOSTLY_BOILERPLATE", "TEXT_TOO_SHORT"])
    );
  });

  it("does not flag a complete server-rendered posting, cookie line and footer included", async () => {
    const result = await fetchHtml(fixture("complete-posting.html"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.rawText).toContain("This site uses cookies");
    expect(result.quality).toEqual({ looksIncomplete: false, reasons: [] });
  });

  it.each(["greenhouse-style.html", "lever-style.html", "workday-style.html"])(
    "does not flag the JSON-LD posting in %s",
    async (name) => {
      const result = await fetchHtml(fixture(name));
      expect(result.ok).toBe(true);
      if (result.ok)
        expect(result.quality).toEqual({ looksIncomplete: false, reasons: [] });
    }
  );
});

describe("assessFetchQuality", () => {
  it("passes a complete posting", () => {
    expect(posting.length).toBeGreaterThanOrEqual(REAL_POSTING_MIN_CHARACTERS);
    expect(
      assessFetchQuality({
        rawText: posting,
        title: "Backend Engineer",
        employer: "Woodgrove",
      })
    ).toEqual({
      looksIncomplete: false,
      reasons: [],
    });
  });

  it("flags page text under the real-posting floor", () => {
    const rawText = "x".repeat(REAL_POSTING_MIN_CHARACTERS - 1);
    expect(
      assessFetchQuality({ rawText, title: "Role", employer: null }).reasons
    ).toEqual(["TEXT_TOO_SHORT"]);
  });

  it("uses the lower floor for a JobPosting description", () => {
    const rawText = "x".repeat(STRUCTURED_POSTING_MIN_CHARACTERS);
    expect(
      assessFetchQuality({
        rawText,
        title: "Role",
        employer: null,
        fromStructuredData: true,
      })
    ).toEqual({
      looksIncomplete: false,
      reasons: [],
    });
    expect(
      assessFetchQuality({ rawText, title: "Role", employer: null }).reasons
    ).toEqual(["TEXT_TOO_SHORT"]);
  });

  it("flags a fetch with neither a title nor an employer", () => {
    expect(
      assessFetchQuality({ rawText: posting, title: null, employer: "  " })
        .reasons
    ).toEqual(["NO_TITLE_OR_EMPLOYER"]);
  });

  it("returns reason codes only, never page text", () => {
    const quality = assessFetchQuality({
      rawText: "Accept all cookies",
      title: null,
      employer: null,
    });
    expect(quality.looksIncomplete).toBe(true);
    expect(JSON.stringify(quality)).not.toContain("cookies");
  });
});

describe("boilerplateShare", () => {
  it("is 0 for empty text", () => {
    expect(boilerplateShare("")).toBe(0);
  });

  it("counts short banner lines in English, Dutch, French and German", () => {
    for (const line of [
      "Accept all cookies",
      "Alle cookies accepteren",
      "Tout accepter",
      "Alle akzeptieren",
      "Please enable JavaScript to continue.",
      "Loading...",
      "Wird geladen",
      "Subscribe to our newsletter",
      "Sign in to apply for this job",
      "Privacy policy",
      "© 2026 Example",
    ]) {
      expect(boilerplateShare(line), line).toBe(1);
    }
  });

  it("does not count a long posting paragraph that mentions a boilerplate word", () => {
    const paragraph =
      "You will own our consent-management service, which records each visitor's cookie choices, and work with the legal team " +
      "on the privacy policy pages, the newsletter sign-up flow and the account sign-in screens used by two million customers " +
      "across Belgium, the Netherlands and Luxembourg, while mentoring two junior engineers and running our weekly design review.";
    expect(paragraph.length).toBeGreaterThan(300);
    expect(boilerplateShare(paragraph)).toBe(0);
  });

  it("does not count ordinary posting lines", () => {
    expect(boilerplateShare(posting)).toBe(0);
  });
});
