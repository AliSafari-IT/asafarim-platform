import { describe, expect, it } from "vitest";
import { type DedupeCandidate, chooseRepresentative, findDuplicate } from "./dedupe";

function candidate(overrides: Partial<DedupeCandidate> = {}): DedupeCandidate {
  return {
    id: "p1",
    sourceId: "s1",
    externalId: "job-1",
    canonicalUrl: "https://jobs.example.test/1",
    canonicalKey: "key-a",
    publishedAt: new Date("2026-08-01T00:00:00Z"),
    firstSeenAt: new Date("2026-08-02T00:00:00Z"),
    commercialUse: true,
    isDirectEmployer: false,
    ...overrides,
  };
}

describe("duplicate detection", () => {
  it("recognises the same record being re-fetched", () => {
    const verdict = findDuplicate(candidate(), [candidate()]);
    expect(verdict).toMatchObject({ isDuplicate: true, reason: "SAME_SOURCE_ID" });
  });

  it("recognises the same apply link from a different source", () => {
    const incoming = candidate({ sourceId: "s2", externalId: "other", canonicalKey: "key-b" });
    const verdict = findDuplicate(incoming, [candidate()]);
    expect(verdict).toMatchObject({ isDuplicate: true, reason: "SAME_URL", representativeId: "p1" });
  });

  it("recognises the same job republished under a different link", () => {
    const incoming = candidate({
      sourceId: "s2",
      externalId: "other",
      canonicalUrl: "https://aggregator.example.test/999",
    });
    const verdict = findDuplicate(incoming, [candidate()]);
    expect(verdict).toMatchObject({ isDuplicate: true, reason: "SAME_CANONICAL_KEY" });
  });

  it("does not merge genuinely different jobs", () => {
    const incoming = candidate({
      sourceId: "s2",
      externalId: "other",
      canonicalUrl: "https://jobs.example.test/2",
      canonicalKey: "key-b",
    });
    expect(findDuplicate(incoming, [candidate()]).isDuplicate).toBe(false);
  });

  it("prefers the strongest evidence when several rules could fire", () => {
    // Same source id AND same key. The source id means "this is the same
    // record", which the caller updates in place; treating it as a
    // cross-source duplicate would create a second row for one posting.
    const existing = [candidate({ id: "same-record" }), candidate({ id: "other", sourceId: "s9" })];
    expect(findDuplicate(candidate(), existing)).toMatchObject({
      reason: "SAME_SOURCE_ID",
      representativeId: "same-record",
    });
  });
});

describe("choosing which copy to display", () => {
  it("prefers the employer's own posting over an aggregator's", () => {
    const chosen = chooseRepresentative([
      candidate({ id: "aggregator", isDirectEmployer: false }),
      candidate({ id: "employer", isDirectEmployer: true }),
    ]);
    expect(chosen.id).toBe("employer");
  });

  it("prefers a source that may be used commercially", () => {
    // Showing a posting from a source that has not granted commercial reuse
    // is a rights problem, not a preference.
    const chosen = chooseRepresentative([
      candidate({ id: "no-rights", commercialUse: false }),
      candidate({ id: "unknown-rights", commercialUse: null }),
      candidate({ id: "granted", commercialUse: true }),
    ]);
    expect(chosen.id).toBe("granted");
  });

  it("prefers the original publication over a republication", () => {
    const chosen = chooseRepresentative([
      candidate({ id: "republished", publishedAt: new Date("2026-08-20T00:00:00Z") }),
      candidate({ id: "original", publishedAt: new Date("2026-08-01T00:00:00Z") }),
    ]);
    expect(chosen.id).toBe("original");
  });

  it("is stable, so a saved job does not appear to move between runs", () => {
    const tied = [
      candidate({ id: "b", publishedAt: null }),
      candidate({ id: "a", publishedAt: null }),
    ];
    expect(chooseRepresentative(tied).id).toBe("a");
    expect(chooseRepresentative([...tied].reverse()).id).toBe("a");
  });

  it("treats unknown commercial rights as not granted", () => {
    const chosen = chooseRepresentative([
      candidate({ id: "unknown", commercialUse: null, publishedAt: new Date("2026-07-01T00:00:00Z") }),
      candidate({ id: "granted", commercialUse: true, publishedAt: new Date("2026-08-01T00:00:00Z") }),
    ]);
    // Even though "unknown" published earlier, rights outrank recency.
    expect(chosen.id).toBe("granted");
  });
});

describe("review regression — a better copy arriving later", () => {
  it("ranks an incoming copy against the stored one, not merely among stored ones", () => {
    // The bug this covers: the first copy to arrive won permanently, so an
    // employer's own posting stayed hidden behind an aggregator's simply
    // because the aggregator synced first — and the rights-based preference
    // the ranking exists for never applied.
    const storedAggregator = candidate({ id: "aggregator", isDirectEmployer: false });
    const incomingEmployer = candidate({ id: "__incoming__", isDirectEmployer: true });

    expect(chooseRepresentative([incomingEmployer, storedAggregator]).id).toBe("__incoming__");
  });

  it("leaves the stored copy in place when the incoming one is weaker", () => {
    const storedEmployer = candidate({ id: "employer", isDirectEmployer: true });
    const incomingAggregator = candidate({ id: "__incoming__", isDirectEmployer: false });

    expect(chooseRepresentative([incomingAggregator, storedEmployer]).id).toBe("employer");
  });
});
