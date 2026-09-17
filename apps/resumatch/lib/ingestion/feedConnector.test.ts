import { describe, expect, it } from "vitest";
import { type FeedMapping, MAX_RECORDS_PER_FETCH, parseFeed } from "./feedConnector";

const mapping: FeedMapping = {
  itemsPath: "data.jobs",
  fields: {
    externalId: "id",
    url: "apply_url",
    title: "title",
    employer: "company.name",
    description: "body",
    location: "company.city",
    publishedAt: "posted",
  },
};

function feed(jobs: unknown[]): string {
  return JSON.stringify({ data: { jobs } });
}

const job = {
  id: "1",
  apply_url: "https://jobs.example.test/1",
  title: "Backend Engineer",
  company: { name: "Example NV", city: "Hasselt" },
  body: "Work on our payments platform.",
  posted: "2026-08-01T00:00:00Z",
};

describe("feed parsing", () => {
  it("maps a nested feed onto normalized postings", () => {
    const result = parseFeed(feed([job]), mapping);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.feed.postings).toHaveLength(1);
    expect(result.feed.postings[0].title).toBe("Backend Engineer");
    expect(result.feed.postings[0].employer).toBe("Example NV");
    expect(result.feed.postings[0].locationRaw).toBe("Hasselt");
  });

  it("counts and skips records missing a required field", () => {
    // A posting with no apply link or employer is worse than no posting, so
    // it is never stored partially.
    const result = parseFeed(feed([job, { id: "2", title: "No URL" }]), mapping);
    if (!result.ok) throw new Error("expected a parse");

    expect(result.feed.postings).toHaveLength(1);
    expect(result.feed.recordsFetched).toBe(2);
    expect(result.feed.failures).toContainEqual({ reasonCode: "MISSING_FIELDS", count: 1 });
  });

  it("reports why records failed rather than only how many", () => {
    const result = parseFeed(
      feed([{ ...job, id: "2", apply_url: "javascript:alert(1)" }]),
      mapping,
    );
    if (!result.ok) throw new Error("expected a parse");
    expect(result.feed.failures).toContainEqual({ reasonCode: "UNSAFE_URL", count: 1 });
  });

  it("refuses malformed JSON", () => {
    expect(parseFeed("{not json", mapping)).toEqual({ ok: false, reasonCode: "MALFORMED_JSON" });
  });

  it("refuses a payload whose items path is not an array", () => {
    expect(parseFeed(JSON.stringify({ data: { jobs: "nope" } }), mapping)).toEqual({
      ok: false,
      reasonCode: "ITEMS_NOT_FOUND",
    });
  });

  it("refuses an implausibly large batch", () => {
    const many = Array.from({ length: MAX_RECORDS_PER_FETCH + 1 }, (_, index) => ({
      ...job,
      id: String(index),
    }));
    expect(parseFeed(feed(many), mapping)).toEqual({ ok: false, reasonCode: "TOO_MANY_RECORDS" });
  });

  it("reads a flat feed with no envelope", () => {
    const flat: FeedMapping = { ...mapping, itemsPath: "" };
    const result = parseFeed(JSON.stringify([job]), flat);
    if (!result.ok) throw new Error("expected a parse");
    expect(result.feed.postings).toHaveLength(1);
  });

  it("is pure, so a stored snapshot can be replayed through it", () => {
    // The property that makes a parser fix deployable without re-fetching,
    // which an agreement may not permit.
    const body = feed([job]);
    expect(parseFeed(body, mapping)).toEqual(parseFeed(body, mapping));
  });
});
