import { describe, expect, it } from "vitest";
import { importGitHubProfile, importGitHubReference, importGitHubRepository, matchGitHubReference } from "./github";
import { REFERENCE_LIMITS } from "./limits";
import { ReferenceFetchFailedError, ReferenceRateLimitedError } from "./errors";

/**
 * M13 slice F — the GitHub adapter. Alongside the happy paths, these pin the
 * three properties that make it safe to point at somebody else's account:
 * requests are unauthenticated (never a token, so never private data), the
 * repository selection is bounded regardless of how many repos exist, and
 * GitHub's own rate limit is reported as rate limiting rather than as a
 * generic failure or — worse — as stale data presented as current.
 */

const resolveHost = async () => ["140.82.121.6"];

function jsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers ?? {}) },
  });
}

function fetchSequence(responses: Response[]) {
  const urls: string[] = [];
  const inits: (RequestInit | undefined)[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    urls.push(String(input));
    inits.push(init);
    const next = responses.shift();
    if (!next) throw new Error(`unexpected extra fetch call: ${String(input)}`);
    return next;
  }) as unknown as typeof fetch;
  return { fetchImpl, urls, inits };
}

const profilePayload = {
  login: "alisafari",
  name: "Ali Safari",
  type: "User",
  bio: "AI developer",
  location: "Genk, Belgium",
  blog: "https://asafarim.com",
  public_repos: 42,
  followers: 120,
  created_at: "2019-04-01T00:00:00Z",
};

function repo(name: string, stars: number, extra: Record<string, unknown> = {}) {
  return {
    name,
    full_name: `alisafari/${name}`,
    description: `${name} description`,
    language: "TypeScript",
    stargazers_count: stars,
    forks_count: 1,
    open_issues_count: 0,
    topics: ["a", "b"],
    pushed_at: "2026-07-01T00:00:00Z",
    ...extra,
  };
}

describe("matchGitHubReference", () => {
  it("recognizes profile and repository URLs", () => {
    expect(matchGitHubReference(new URL("https://github.com/alisafari"))).toEqual({
      kind: "profile",
      adapter: "github_profile",
      login: "alisafari",
    });
    expect(matchGitHubReference(new URL("https://github.com/alisafari/asafarim-platform"))).toEqual({
      kind: "repository",
      adapter: "github_repository",
      owner: "alisafari",
      repo: "asafarim-platform",
    });
    expect(matchGitHubReference(new URL("https://www.github.com/alisafari/repo.git"))).toMatchObject({ repo: "repo" });
  });

  it("declines everything it cannot handle reliably, leaving it to the generic adapter", () => {
    // Deep paths, reserved paths, other hosts — guessing at these would
    // produce confident nonsense.
    expect(matchGitHubReference(new URL("https://github.com/a/b/pull/12"))).toBeNull();
    expect(matchGitHubReference(new URL("https://github.com/a/b/blob/main/README.md"))).toBeNull();
    expect(matchGitHubReference(new URL("https://github.com/topics/typescript"))).toBeNull();
    expect(matchGitHubReference(new URL("https://github.com/settings"))).toBeNull();
    expect(matchGitHubReference(new URL("https://github.com/"))).toBeNull();
    expect(matchGitHubReference(new URL("https://gist.github.com/alisafari"))).toBeNull();
    expect(matchGitHubReference(new URL("https://api.github.com/users/alisafari"))).toBeNull();
    expect(matchGitHubReference(new URL("https://example.com/alisafari"))).toBeNull();
  });
});

describe("importGitHubProfile", () => {
  it("calls the public API without any Authorization header", async () => {
    const { fetchImpl, urls, inits } = fetchSequence([jsonResponse(profilePayload), jsonResponse([])]);
    await importGitHubProfile("alisafari", { fetchImpl, resolveHost });

    expect(urls[0]).toBe("https://api.github.com/users/alisafari");
    for (const init of inits) {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      // Never a token: an authenticated call would silently widen this from
      // public metadata to whatever that token can read.
      expect(Object.keys(headers).map((key) => key.toLowerCase())).not.toContain("authorization");
      expect(headers.accept).toBe("application/vnd.github+json");
    }
  });

  it("projects bounded profile facts", async () => {
    const { fetchImpl } = fetchSequence([jsonResponse(profilePayload), jsonResponse([repo("one", 5)])]);
    const result = await importGitHubProfile("alisafari", { fetchImpl, resolveHost });

    expect(result.adapter).toBe("github_profile");
    expect(result.title).toContain("Ali Safari");
    const labels = result.facts.map((fact) => fact.label);
    expect(labels).toContain("bio");
    expect(labels).toContain("public repositories");
    expect(result.facts.length).toBeLessThanOrEqual(REFERENCE_LIMITS.MAX_FACTS);
    expect(result.text).toContain("AI developer");
  });

  it("keeps only the top repositories however many exist, ranked by stars", async () => {
    const many = Array.from({ length: 40 }, (_, index) => repo(`repo-${index}`, index));
    const { fetchImpl } = fetchSequence([jsonResponse(profilePayload), jsonResponse(many)]);
    const result = await importGitHubProfile("alisafari", { fetchImpl, resolveHost });

    const summary = result.facts.find((fact) => fact.label.startsWith("notable public repositories"));
    expect(summary?.value).toContain("repo-39");
    expect(summary?.value).not.toContain("repo-0 ");
    expect(summary?.value.split(", ").length).toBe(REFERENCE_LIMITS.MAX_GITHUB_REPOSITORIES);
  });

  it("ranks forks and archived repositories below owned, active ones", async () => {
    const repos = [repo("forked", 500, { fork: true }), repo("archived", 400, { archived: true }), repo("active", 10)];
    const { fetchImpl } = fetchSequence([jsonResponse(profilePayload), jsonResponse(repos)]);
    const result = await importGitHubProfile("alisafari", { fetchImpl, resolveHost });

    const summary = result.facts.find((fact) => fact.label.startsWith("notable public repositories"));
    expect(summary?.value.indexOf("active")).toBeLessThan(summary?.value.indexOf("forked") ?? -1);
  });

  it("still returns the profile when the repository listing fails", async () => {
    const { fetchImpl } = fetchSequence([jsonResponse(profilePayload), new Response(null, { status: 500 })]);
    const result = await importGitHubProfile("alisafari", { fetchImpl, resolveHost });
    expect(result.facts.map((fact) => fact.label)).toContain("bio");
  });

  it("surfaces a rate-limited profile call as rate limiting", async () => {
    const { fetchImpl } = fetchSequence([
      new Response(null, {
        status: 403,
        headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 300) },
      }),
    ]);
    await expect(importGitHubProfile("alisafari", { fetchImpl, resolveHost })).rejects.toBeInstanceOf(ReferenceRateLimitedError);
  });

  it("surfaces a missing account as a safe failure", async () => {
    const { fetchImpl } = fetchSequence([new Response('{"message":"Not Found"}', { status: 404, headers: { "content-type": "application/json" } })]);
    await expect(importGitHubProfile("ghost", { fetchImpl, resolveHost })).rejects.toBeInstanceOf(ReferenceFetchFailedError);
  });

  it("reports unreadable JSON without echoing the response body", async () => {
    const { fetchImpl } = fetchSequence([new Response("<html>not json</html>", { status: 200, headers: { "content-type": "application/json" } })]);
    await expect(importGitHubProfile("alisafari", { fetchImpl, resolveHost })).rejects.toMatchObject({
      message: expect.not.stringContaining("<html>"),
    });
  });
});

describe("importGitHubRepository", () => {
  it("projects bounded repository facts, capping topics", async () => {
    const payload = repo("asafarim-platform", 12, {
      topics: Array.from({ length: 20 }, (_, index) => `topic-${index}`),
      license: { spdx_id: "MIT" },
      homepage: "https://asafarim.com",
      default_branch: "main",
      created_at: "2025-01-01T00:00:00Z",
    });
    const { fetchImpl, urls } = fetchSequence([jsonResponse(payload)]);
    const result = await importGitHubRepository("alisafari", "asafarim-platform", { fetchImpl, resolveHost });

    expect(urls[0]).toBe("https://api.github.com/repos/alisafari/asafarim-platform");
    expect(result.adapter).toBe("github_repository");
    const topics = result.facts.find((fact) => fact.label === "topics");
    expect(topics?.value.split(", ").length).toBe(REFERENCE_LIMITS.MAX_GITHUB_TOPICS);
    expect(result.facts.find((fact) => fact.label === "license")?.value).toBe("MIT");
  });

  it("truncates an over-long value rather than carrying it whole", async () => {
    const payload = repo("long", 1, { description: "x".repeat(2_000) });
    const { fetchImpl } = fetchSequence([jsonResponse(payload)]);
    const result = await importGitHubRepository("alisafari", "long", { fetchImpl, resolveHost });
    const description = result.facts.find((fact) => fact.label === "description");
    expect(description?.value.length).toBe(REFERENCE_LIMITS.MAX_FACT_VALUE_CHARS);
  });
});

describe("importGitHubReference", () => {
  it("returns null for a URL the adapter does not claim, so the generic adapter runs", async () => {
    const { fetchImpl } = fetchSequence([]);
    await expect(importGitHubReference(new URL("https://example.com/page"), { fetchImpl, resolveHost })).resolves.toBeNull();
    await expect(importGitHubReference(new URL("https://github.com/a/b/pull/3"), { fetchImpl, resolveHost })).resolves.toBeNull();
  });

  it("dispatches a repository URL to the repository adapter", async () => {
    const { fetchImpl } = fetchSequence([jsonResponse(repo("platform", 3))]);
    const result = await importGitHubReference(new URL("https://github.com/alisafari/platform"), { fetchImpl, resolveHost });
    expect(result?.adapter).toBe("github_repository");
  });
});
