import { describe, expect, it } from "vitest";
import { emptyProfile, type CandidateProfileContent } from "../profile/contract";
import { evaluateEligibility, type PostingForEligibility } from "../eligibility/evaluate";
import {
  DEFAULT_SHORTLIST_SIZE,
  rank,
  type ExplicitPreferences,
  type PostingForRanking,
} from "./rank";

function posting(overrides: Partial<PostingForRanking> = {}): PostingForRanking {
  return {
    id: "posting-1",
    skillsRaw: ["TypeScript", "React"],
    locationRaw: "Hasselt, Belgium",
    isRemote: false,
    contractType: "Permanent",
    salaryMin: 45000,
    salaryMax: 60000,
    salaryCurrency: "EUR",
    salaryPeriod: "year",
    ...overrides,
  };
}

function eligibilityPosting(overrides: Partial<PostingForEligibility> = {}): PostingForEligibility {
  return {
    employer: "Example NV",
    locationRaw: "Hasselt, Belgium",
    isRemote: false,
    contractType: "Permanent",
    salaryMin: 45000,
    salaryMax: 60000,
    salaryCurrency: "EUR",
    salaryPeriod: "year",
    requiresSponsorship: null,
    languageRequired: [],
    requiredCertifications: [],
    ...overrides,
  };
}

function preferences(overrides: Partial<ExplicitPreferences> = {}): ExplicitPreferences {
  return {
    skills: ["TypeScript", "React"],
    locations: ["Hasselt"],
    remote: "any",
    contractTypes: [],
    salaryFloor: null,
    salaryCurrency: null,
    ...overrides,
  };
}

function profile(overrides: Partial<CandidateProfileContent> = {}): CandidateProfileContent {
  return { ...emptyProfile(), ...overrides };
}

/** Deterministic fixture vector, same shape as the app's fixture embedding
 *  provider -- a stable numeric fingerprint, not a semantic embedding. */
function vector(seed: number, dims = 384): number[] {
  const out: number[] = [];
  let x = seed || 1;
  for (let i = 0; i < dims; i += 1) {
    // xorshift-ish deterministic PRNG, fine for test fixtures
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    x = x | 0;
    out.push(((x % 1000) / 1000) * 2 - 1);
  }
  return out;
}

describe("rank: stable, reproducible order", () => {
  it("returns the same order for the same inputs across repeated calls", () => {
    const postings = [posting({ id: "a" }), posting({ id: "b" }), posting({ id: "c" })];
    const embeddings = new Map([
      ["a", vector(1)],
      ["b", vector(2)],
      ["c", vector(3)],
    ]);
    const prefs = preferences();
    const profileEmbedding = vector(99);

    const run1 = rank(postings, profileEmbedding, embeddings, prefs);
    const run2 = rank(postings, profileEmbedding, embeddings, prefs);

    expect(run1.map((r) => r.postingId)).toEqual(run2.map((r) => r.postingId));
    expect(run1).toEqual(run2);
  });
});

describe("rank: hard-excluded postings never enter ranking", () => {
  it("a posting present in the full posting list but absent from eligiblePostings never appears in output", () => {
    const fullPostings = [
      posting({ id: "eligible-1" }),
      posting({ id: "excluded-1" }),
      posting({ id: "eligible-2" }),
    ];
    // "excluded-1" is dropped as if M4 hard-excluded it -- deliberately
    // given a very high-similarity embedding so a bug that bypassed the
    // pre-filter would be obvious from the output.
    const eligiblePostings = fullPostings.filter((p) => p.id !== "excluded-1");

    const profileEmbedding = vector(7);
    const embeddings = new Map([
      ["eligible-1", vector(101)],
      ["excluded-1", profileEmbedding], // identical vector -> perfect similarity
      ["eligible-2", vector(103)],
    ]);

    const result = rank(eligiblePostings, profileEmbedding, embeddings, preferences());

    expect(result.map((r) => r.postingId)).not.toContain("excluded-1");
    expect(result.map((r) => r.postingId).sort()).toEqual(["eligible-1", "eligible-2"].sort());
  });

  it("composes with evaluateEligibility: a real hard exclusion never resurfaces in rank's output", () => {
    const candidateProfile = profile({
      workAuthorization: "requires_sponsorship",
      preferences: { ...emptyProfile().preferences, remote: "remote" },
    });

    const onSitePosting = eligibilityPosting({ isRemote: false }); // excluded: remote-only preference
    const noSponsorPosting = eligibilityPosting({ isRemote: true, requiresSponsorship: false }); // excluded: needs sponsorship
    const goodPosting = eligibilityPosting({ isRemote: true, requiresSponsorship: null });

    const withIds = [
      { id: "on-site", posting: onSitePosting },
      { id: "no-sponsor", posting: noSponsorPosting },
      { id: "good", posting: goodPosting },
    ];

    const eligibleIds = withIds
      .filter(({ posting: p }) => evaluateEligibility(candidateProfile, p).eligible)
      .map(({ id }) => id);

    expect(eligibleIds).toEqual(["good"]);

    const eligiblePostings: PostingForRanking[] = eligibleIds.map((id) =>
      posting({ id, isRemote: true }),
    );

    const profileEmbedding = vector(5);
    const embeddings = new Map([
      ["on-site", profileEmbedding],
      ["no-sponsor", profileEmbedding],
      ["good", vector(55)],
    ]);

    const result = rank(eligiblePostings, profileEmbedding, embeddings, preferences({ remote: "remote" }));

    expect(result.map((r) => r.postingId)).toEqual(["good"]);
    expect(result.map((r) => r.postingId)).not.toContain("on-site");
    expect(result.map((r) => r.postingId)).not.toContain("no-sponsor");
  });
});

describe("rank: score breakdown", () => {
  it("exposes each factor's contribution independently, not just the total", () => {
    const postings = [posting({ id: "a" })];
    const embeddings = new Map([["a", vector(1)]]);
    const result = rank(postings, vector(2), embeddings, preferences());

    expect(result).toHaveLength(1);
    const [item] = result;
    expect(item.postingId).toBe("a");
    expect(typeof item.totalScore).toBe("number");
    expect(item.breakdown).toEqual(
      expect.objectContaining({
        similarity: expect.any(Number),
        skillsMatch: expect.any(Number),
        locationMatch: expect.any(Number),
        remoteMatch: expect.any(Number),
        contractMatch: expect.any(Number),
        salaryMatch: expect.any(Number),
      }),
    );
  });

  it("scores full skills overlap as 1 and no overlap as 0", () => {
    const fullOverlap = posting({ id: "full", skillsRaw: ["TypeScript", "React"] });
    const noOverlap = posting({ id: "none", skillsRaw: ["COBOL"] });
    const embeddings = new Map([
      ["full", vector(1)],
      ["none", vector(1)],
    ]);
    const prefs = preferences({ skills: ["TypeScript", "React"] });

    const result = rank([fullOverlap, noOverlap], vector(1), embeddings, prefs);
    const full = result.find((r) => r.postingId === "full")!;
    const none = result.find((r) => r.postingId === "none")!;

    expect(full.breakdown.skillsMatch).toBe(1);
    expect(none.breakdown.skillsMatch).toBe(0);
  });
});

describe("rank: deterministic tie-break", () => {
  it("orders postings with identical scores by postingId ascending", () => {
    // Same embedding, same preference-relevant fields -> identical totalScore.
    const shared = vector(42);
    const postings = [
      posting({ id: "zzz" }),
      posting({ id: "aaa" }),
      posting({ id: "mmm" }),
    ];
    const embeddings = new Map([
      ["zzz", shared],
      ["aaa", shared],
      ["mmm", shared],
    ]);

    const result = rank(postings, shared, embeddings, preferences());

    const scores = new Set(result.map((r) => r.totalScore));
    expect(scores.size).toBe(1); // confirm the fixture actually ties
    expect(result.map((r) => r.postingId)).toEqual(["aaa", "mmm", "zzz"]);
  });
});

describe("rank: bounded output", () => {
  it("truncates to opts.limit after sorting", () => {
    const postings = Array.from({ length: 5 }, (_, i) => posting({ id: `p${i}` }));
    const embeddings = new Map(postings.map((p, i) => [p.id, vector(i + 1)]));

    const result = rank(postings, vector(1), embeddings, preferences(), { limit: 2 });
    expect(result).toHaveLength(2);
  });

  it("defaults to DEFAULT_SHORTLIST_SIZE when opts.limit is not given", () => {
    const postings = Array.from({ length: DEFAULT_SHORTLIST_SIZE + 5 }, (_, i) =>
      posting({ id: `p${i}` }),
    );
    const embeddings = new Map(postings.map((p, i) => [p.id, vector(i + 1)]));

    const result = rank(postings, vector(1), embeddings, preferences());
    expect(result).toHaveLength(DEFAULT_SHORTLIST_SIZE);
  });
});
