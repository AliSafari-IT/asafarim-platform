import { describe, expect, it } from "vitest";
import {
  NORMALIZER_VERSION,
  buildCanonicalKey,
  canonicalizeUrl,
  normalizePosting,
} from "./normalize";

const valid = {
  externalId: "job-123",
  url: "https://jobs.example.test/vacancy/123",
  title: "Senior Backend Engineer",
  employer: "Example NV",
  description: "Build and run our payments platform.",
};

describe("posting normalization", () => {
  it("normalizes a complete record", () => {
    const result = normalizePosting({
      ...valid,
      language: "NL",
      location: "Hasselt,  Belgium",
      remote: true,
      contractType: "Permanent",
      salaryMin: 55000,
      salaryMax: 70000,
      salaryCurrency: "eur",
      salaryPeriod: "year",
      skills: ["TypeScript", "typescript", "PostgreSQL"],
      requiresSponsorship: false,
      languageRequired: ["Dutch", "Klingon"],
      requiredCertifications: ["AWS-SA"],
      publishedAt: "2026-08-01T00:00:00Z",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.posting.language).toBe("nl");
    expect(result.posting.salaryCurrency).toBe("EUR");
    expect(result.posting.contractType).toBe("permanent");
    // Case-insensitive dedupe, but the source's own wording is kept — M4
    // needs the original and must not lose it.
    expect(result.posting.skillsRaw).toEqual(["TypeScript", "PostgreSQL"]);
    expect(result.posting.normalizerVersion).toBe(NORMALIZER_VERSION);
    // Legal-suffix-stripped, folded form, computed once for opt-out matching.
    expect(result.posting.employerKey).toBe("example");
    expect(result.posting.requiresSponsorship).toBe(false);
    // An unrecognised token ("Klingon") is dropped rather than guessed at.
    expect(result.posting.languageRequired).toEqual(["nl"]);
    expect(result.posting.requiredCertifications).toEqual(["AWS-SA"]);
  });

  it("rejects a record missing the fields that make it traceable", () => {
    expect(normalizePosting({ ...valid, externalId: "" }).ok).toBe(false);
    expect(normalizePosting({ ...valid, url: "not-a-url" }).ok).toBe(false);
    expect(normalizePosting({ ...valid, employer: "" }).ok).toBe(false);
  });

  it("refuses an inverted salary range rather than guessing", () => {
    // Silently swapping the ends would have M4 exclude candidates on a
    // number nobody wrote.
    const result = normalizePosting({ ...valid, salaryMin: 90000, salaryMax: 40000 });
    expect(result).toEqual({ ok: false, reasonCode: "SALARY_RANGE_INVERTED" });
  });

  it("is deterministic, which is what makes a snapshot replayable", () => {
    expect(normalizePosting(valid)).toEqual(normalizePosting(valid));
  });

  it("changes the content hash only when content changes", () => {
    const a = normalizePosting(valid);
    const b = normalizePosting({ ...valid, title: "Staff Backend Engineer" });
    const c = normalizePosting({ ...valid, url: `${valid.url}?utm_source=newsletter` });
    if (!a.ok || !b.ok || !c.ok) throw new Error("expected all to normalize");

    expect(a.posting.contentHash).not.toBe(b.posting.contentHash);
    // A tracking tag is not a content change.
    expect(a.posting.contentHash).toBe(c.posting.contentHash);
  });
});

describe("url canonicalization", () => {
  it("strips tracking parameters", () => {
    expect(canonicalizeUrl("https://x.test/job/1?utm_source=a&utm_medium=b&id=7")).toBe(
      "https://x.test/job/1?id=7",
    );
    expect(canonicalizeUrl("https://x.test/job/1?fbclid=abc")).toBe("https://x.test/job/1");
  });

  it("sorts the query so parameter order is not an identity", () => {
    expect(canonicalizeUrl("https://x.test/j?b=2&a=1")).toBe(canonicalizeUrl("https://x.test/j?a=1&b=2"));
  });

  it("drops the fragment and a trailing slash", () => {
    expect(canonicalizeUrl("https://x.test/job/1/#apply")).toBe("https://x.test/job/1");
  });

  it("refuses a non-http scheme", () => {
    expect(canonicalizeUrl("javascript:alert(1)")).toBeNull();
    expect(canonicalizeUrl("data:text/html,x")).toBeNull();
  });
});

describe("canonical key", () => {
  it("matches the same job across republishers", () => {
    // The point of the key: an aggregator's copy must collide with the
    // employer's original.
    const employerCopy = buildCanonicalKey({
      employer: "Example NV",
      title: "Senior Backend Engineer",
      location: "Hasselt, Belgium",
    });
    const aggregatorCopy = buildCanonicalKey({
      employer: "EXAMPLE",
      title: "senior backend engineer",
      location: "hasselt belgium",
    });
    expect(employerCopy).toBe(aggregatorCopy);
  });

  it("separates genuinely different jobs", () => {
    const backend = buildCanonicalKey({ employer: "Example", title: "Backend Engineer" });
    const frontend = buildCanonicalKey({ employer: "Example", title: "Frontend Engineer" });
    expect(backend).not.toBe(frontend);
  });

  it("separates the same title at different employers", () => {
    expect(buildCanonicalKey({ employer: "A Corp", title: "Engineer" })).not.toBe(
      buildCanonicalKey({ employer: "B Corp", title: "Engineer" }),
    );
  });
});
