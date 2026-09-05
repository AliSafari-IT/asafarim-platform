import { describe, expect, it } from "vitest";
import { authorizeSource, isPublicHttpsUrl } from "./authorization";
import { findDuplicate } from "./dedupe";
import { feedMappingSchema, parseFeed } from "./feedConnector";
import {
  SHOWCASE_ACTIVE_COUNT,
  SHOWCASE_AGREEMENT_EXPIRES_AT,
  SHOWCASE_AGREEMENT_REFERENCE,
  SHOWCASE_ATTRIBUTION,
  SHOWCASE_FIELD_MAPPING,
  SHOWCASE_RECORD_COUNT,
  SHOWCASE_SOURCE_ENDPOINT,
  SHOWCASE_SOURCE_KEY,
  showcaseFeedBody,
} from "./showcaseFixture";

/**
 * The synthetic showcase source, tested where it can be tested without a
 * database: the feed body, its mapping, normalization, deduplication, and
 * the source metadata that decides whether ingestion is even allowed to
 * run. The database-backed load (idempotency, search, eligibility) is
 * covered in showcaseSource.integration.test.ts.
 */

describe("showcase feed body", () => {
  it("is deterministic — identical bytes on every call", () => {
    expect(showcaseFeedBody()).toBe(showcaseFeedBody());
  });

  it("is valid JSON with the postings where the mapping expects them", () => {
    const payload = JSON.parse(showcaseFeedBody()) as { jobs: unknown[] };
    expect(Array.isArray(payload.jobs)).toBe(true);
    expect(payload.jobs).toHaveLength(SHOWCASE_RECORD_COUNT);
  });

  it("uses a mapping that satisfies the connector contract", () => {
    expect(feedMappingSchema.safeParse(SHOWCASE_FIELD_MAPPING).success).toBe(true);
  });
});

describe("showcase feed normalization", () => {
  const parsed = parseFeed(showcaseFeedBody(), feedMappingSchema.parse(SHOWCASE_FIELD_MAPPING));

  it("normalizes every record with no failures", () => {
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.feed.failures).toEqual([]);
    expect(parsed.feed.recordsFetched).toBe(SHOWCASE_RECORD_COUNT);
    expect(parsed.feed.postings).toHaveLength(SHOWCASE_RECORD_COUNT);
  });

  it("carries provenance on every posting — apply URL, employer key, content hash", () => {
    if (!parsed.ok) throw new Error("feed did not parse");
    for (const posting of parsed.feed.postings) {
      expect(posting.canonicalUrl).toMatch(/^https:\/\//);
      expect(posting.employerKey.length).toBeGreaterThan(0);
      expect(posting.contentHash).toHaveLength(64);
    }
  });

  it("maps stated language requirements to ISO codes", () => {
    if (!parsed.ok) throw new Error("feed did not parse");
    const qa = parsed.feed.postings.find((posting) => posting.externalId === "hasselt-qa");
    expect(qa?.languageRequired).toEqual(["nl", "en"]);
  });
});

describe("showcase feed deduplication", () => {
  it("contains one deliberate duplicate that collapses to a single displayed job", () => {
    const parsed = parseFeed(showcaseFeedBody(), feedMappingSchema.parse(SHOWCASE_FIELD_MAPPING));
    if (!parsed.ok) throw new Error("feed did not parse");

    const distinctUrls = new Set(parsed.feed.postings.map((posting) => posting.canonicalUrl));
    expect(distinctUrls.size).toBe(SHOWCASE_ACTIVE_COUNT);
    expect(SHOWCASE_ACTIVE_COUNT).toBe(SHOWCASE_RECORD_COUNT - 1);

    const original = parsed.feed.postings.find((p) => p.externalId === "antwerpen-fullstack");
    const copy = parsed.feed.postings.find((p) => p.externalId === "dup-antwerpen-fs");
    expect(original && copy).toBeTruthy();

    const verdict = findDuplicate(
      {
        sourceId: "s1",
        externalId: copy!.externalId,
        canonicalUrl: copy!.canonicalUrl,
        canonicalKey: copy!.canonicalKey,
        publishedAt: copy!.publishedAt,
        firstSeenAt: new Date(),
        commercialUse: false,
        isDirectEmployer: true,
      },
      [
        {
          id: "stored",
          sourceId: "s1",
          externalId: original!.externalId,
          canonicalUrl: original!.canonicalUrl,
          canonicalKey: original!.canonicalKey,
          publishedAt: original!.publishedAt,
          firstSeenAt: new Date(),
          commercialUse: false,
          isDirectEmployer: true,
        },
      ],
    );
    expect(verdict).toMatchObject({ isDuplicate: true, representativeId: "stored" });
  });
});

describe("showcase source metadata", () => {
  it("is authorized to sync — it carries a recorded, unexpired agreement and a public endpoint", () => {
    const result = authorizeSource(
      {
        status: "ACTIVE",
        syncEnabled: true,
        agreementReference: SHOWCASE_AGREEMENT_REFERENCE,
        agreementExpiresAt: SHOWCASE_AGREEMENT_EXPIRES_AT,
        endpoint: SHOWCASE_SOURCE_ENDPOINT,
      },
      new Date("2026-09-05T00:00:00Z"),
    );
    expect(result).toEqual({ allowed: true });
  });

  it("has an endpoint that passes the SSRF allowlist", () => {
    expect(isPublicHttpsUrl(SHOWCASE_SOURCE_ENDPOINT)).toBe(true);
  });

  it("names itself as synthetic and never as a live vacancy", () => {
    expect(SHOWCASE_SOURCE_KEY).toContain("synthetic");
    expect(SHOWCASE_ATTRIBUTION.toLowerCase()).toContain("synthetic");
    expect(SHOWCASE_ATTRIBUTION.toLowerCase()).toContain("not a live vacancy");
  });
});
