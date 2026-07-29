import { ReferenceFetchFailedError, ReferenceNoContentError } from "./errors";
import { fetchBoundedReference, type ReferenceFetchDeps } from "./fetchReference";
import { boundReferenceText } from "./extract";
import { REFERENCE_ADAPTER_VERSIONS, REFERENCE_LIMITS, type ReferenceAdapter, type ReferenceFact } from "./limits";

/**
 * M13 slice F — the GitHub adapter, over the PUBLIC REST API only.
 *
 * Three boundaries this module holds deliberately:
 *
 * **Unauthenticated, always.** No token is read from the environment and no
 * `Authorization` header is ever sent. That is not an omission to fix later:
 * a token would silently widen this from "public metadata" to "whatever that
 * token can see", which M13 lists as out of scope ("Autonomous third-party
 * login or private GitHub access without a separately authorized
 * integration"). The cost is GitHub's 60-requests/hour-per-IP limit, which is
 * why rate limiting is a first-class, honestly-reported outcome
 * (`ReferenceRateLimitedError`) rather than a generic failure.
 *
 * **Bounded selection.** A profile import reads at most one page of
 * repositories and keeps `MAX_GITHUB_REPOSITORIES` of them, ranked by stars
 * then recency — "their notable public repositories", not "everything they
 * have ever pushed". An account with 900 repositories produces the same
 * shaped, same-sized reference as one with three.
 *
 * **Facts, not pages.** The API returns far more than is useful; this module
 * projects a fixed, small set of labelled facts. Every value is still remote,
 * user-controlled text (a bio or repository description can say anything), so
 * facts are wrapped as untrusted data at prompt-build time exactly like a
 * fetched HTML body.
 */

const GITHUB_WEB_HOSTS = new Set(["github.com", "www.github.com"]);
const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_JSON_CONTENT_TYPES = ["application/json"] as const;

/** Reserved github.com paths that are not user/org profiles. */
const NON_PROFILE_PATHS = new Set([
  "about",
  "apps",
  "blog",
  "collections",
  "contact",
  "customer-stories",
  "enterprise",
  "events",
  "explore",
  "features",
  "issues",
  "login",
  "marketplace",
  "notifications",
  "orgs",
  "pricing",
  "pulls",
  "readme",
  "search",
  "security",
  "settings",
  "site",
  "sponsors",
  "topics",
  "trending",
]);

const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const REPO_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

export type GitHubReference =
  | { kind: "profile"; adapter: Extract<ReferenceAdapter, "github_profile">; login: string }
  | { kind: "repository"; adapter: Extract<ReferenceAdapter, "github_repository">; owner: string; repo: string };

/**
 * Recognizes a github.com profile or repository URL. Returns null for
 * anything else — including api.github.com, gist.github.com, raw
 * .githubusercontent.com, and deep repository paths (a file, a pull request,
 * an issue): those are handled by the generic HTML adapter or not at all,
 * rather than being guessed at by this one.
 */
export function matchGitHubReference(url: URL): GitHubReference | null {
  if (!GITHUB_WEB_HOSTS.has(url.hostname.toLowerCase())) return null;

  const segments = url.pathname.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0) return null;

  const [first, second] = segments;
  if (NON_PROFILE_PATHS.has(first.toLowerCase())) return null;
  if (!OWNER_PATTERN.test(first)) return null;

  if (segments.length === 1) {
    return { kind: "profile", adapter: "github_profile", login: first };
  }
  if (segments.length === 2 && REPO_PATTERN.test(second)) {
    return { kind: "repository", adapter: "github_repository", repo: second.replace(/\.git$/, ""), owner: first };
  }
  return null;
}

export type { ReferenceFact };

export interface GitHubAdapterResult {
  adapter: ReferenceAdapter;
  adapterVersion: string;
  title: string;
  facts: ReferenceFact[];
  /** A bounded, human-readable rendering of the same facts — what a model actually reads. */
  text: string;
  /** The API URL that produced the primary payload, for provenance. */
  finalUrl: string;
  rateLimit: { remaining: number | null; resetAtSeconds: number | null };
}

function fact(label: string, value: unknown): ReferenceFact | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === "string" ? value.trim() : String(value);
  if (text.length === 0) return null;
  return { label, value: text.slice(0, REFERENCE_LIMITS.MAX_FACT_VALUE_CHARS) };
}

function compactFacts(candidates: (ReferenceFact | null)[]): ReferenceFact[] {
  return candidates.filter((entry): entry is ReferenceFact => entry !== null).slice(0, REFERENCE_LIMITS.MAX_FACTS);
}

function renderFacts(facts: readonly ReferenceFact[]): string {
  return boundReferenceText(facts.map((entry) => `${entry.label}: ${entry.value}`).join("\n")).text;
}

async function getJson(url: string, deps: ReferenceFetchDeps): Promise<{ payload: unknown; finalUrl: string; rateLimit: GitHubAdapterResult["rateLimit"] }> {
  const result = await fetchBoundedReference(
    url,
    {
      allowedContentTypes: GITHUB_JSON_CONTENT_TYPES,
      // The API answers with the documented JSON media type; asking for it
      // explicitly also pins the response schema version.
      headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" },
    },
    deps,
  );
  try {
    return { payload: JSON.parse(result.body.toString("utf8")), finalUrl: result.finalUrl, rateLimit: result.rateLimit };
  } catch {
    throw new ReferenceFetchFailedError("GitHub returned a response that could not be read.");
  }
}

interface GitHubUserPayload {
  login?: string;
  name?: string | null;
  bio?: string | null;
  company?: string | null;
  location?: string | null;
  blog?: string | null;
  type?: string;
  public_repos?: number;
  followers?: number;
  created_at?: string;
  html_url?: string;
}

interface GitHubRepoPayload {
  name?: string;
  full_name?: string;
  description?: string | null;
  html_url?: string;
  homepage?: string | null;
  language?: string | null;
  stargazers_count?: number;
  forks_count?: number;
  open_issues_count?: number;
  topics?: string[];
  license?: { spdx_id?: string | null; name?: string | null } | null;
  archived?: boolean;
  fork?: boolean;
  pushed_at?: string;
  updated_at?: string;
  created_at?: string;
  default_branch?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Ranks a user's repositories for the bounded selection: most-starred first,
 * most-recently-pushed as the tiebreak, forks and archived repositories last.
 * A profile's "interesting" repositories are the ones other people found
 * interesting — not whichever page the API happened to return first.
 */
function selectRepositories(repos: GitHubRepoPayload[]): GitHubRepoPayload[] {
  return [...repos]
    .sort((a, b) => {
      const penalty = (repo: GitHubRepoPayload) => (repo.fork ? 2 : 0) + (repo.archived ? 1 : 0);
      const byPenalty = penalty(a) - penalty(b);
      if (byPenalty !== 0) return byPenalty;
      const byStars = (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0);
      if (byStars !== 0) return byStars;
      return new Date(b.pushed_at ?? 0).getTime() - new Date(a.pushed_at ?? 0).getTime();
    })
    .slice(0, REFERENCE_LIMITS.MAX_GITHUB_REPOSITORIES);
}

function repositoryFacts(repo: GitHubRepoPayload, prefix = ""): (ReferenceFact | null)[] {
  const label = (name: string) => (prefix ? `${prefix} ${name}` : name);
  return [
    fact(label("repository"), repo.full_name ?? repo.name),
    fact(label("description"), repo.description),
    fact(label("primary language"), repo.language),
    fact(label("stars"), repo.stargazers_count),
    fact(label("forks"), repo.forks_count),
    fact(label("open issues"), repo.open_issues_count),
    fact(label("topics"), (repo.topics ?? []).slice(0, REFERENCE_LIMITS.MAX_GITHUB_TOPICS).join(", ")),
    fact(label("license"), repo.license?.spdx_id ?? repo.license?.name ?? null),
    fact(label("homepage"), repo.homepage),
    fact(label("archived"), repo.archived ? "yes" : null),
    fact(label("last pushed"), repo.pushed_at),
  ];
}

/** Imports a public GitHub user/organization profile plus a bounded selection of their repositories. */
export async function importGitHubProfile(login: string, deps: ReferenceFetchDeps = {}): Promise<GitHubAdapterResult> {
  const user = await getJson(`${GITHUB_API_BASE}/users/${encodeURIComponent(login)}`, deps);
  if (!isRecord(user.payload)) throw new ReferenceNoContentError();
  const profile = user.payload as GitHubUserPayload;

  // A failed repository listing must not lose the profile we already have —
  // partial data with honest provenance beats an all-or-nothing failure.
  let repositories: GitHubRepoPayload[] = [];
  try {
    const repos = await getJson(
      `${GITHUB_API_BASE}/users/${encodeURIComponent(login)}/repos?per_page=100&sort=pushed&type=owner`,
      deps,
    );
    if (Array.isArray(repos.payload)) {
      repositories = selectRepositories(repos.payload.filter(isRecord) as GitHubRepoPayload[]);
    }
  } catch {
    repositories = [];
  }

  const facts = compactFacts([
    fact("login", profile.login ?? login),
    fact("account type", profile.type),
    fact("name", profile.name),
    fact("bio", profile.bio),
    fact("company", profile.company),
    fact("location", profile.location),
    fact("website", profile.blog),
    fact("public repositories", profile.public_repos),
    fact("followers", profile.followers),
    fact("account created", profile.created_at),
    fact(
      `notable public repositories (top ${repositories.length})`,
      repositories.map((repo) => `${repo.name}${repo.stargazers_count ? ` (${repo.stargazers_count}★)` : ""}`).join(", "),
    ),
    ...repositories.flatMap((repo, index) => repositoryFacts(repo, `repo ${index + 1}`).slice(0, 4)),
  ]);

  return {
    adapter: "github_profile",
    adapterVersion: REFERENCE_ADAPTER_VERSIONS.github_profile,
    title: `GitHub profile: ${profile.name ? `${profile.name} (${profile.login ?? login})` : (profile.login ?? login)}`.slice(
      0,
      REFERENCE_LIMITS.MAX_TITLE_CHARS,
    ),
    facts,
    text: renderFacts(facts),
    finalUrl: user.finalUrl,
    rateLimit: user.rateLimit,
  };
}

/** Imports one public GitHub repository's metadata. */
export async function importGitHubRepository(owner: string, repo: string, deps: ReferenceFetchDeps = {}): Promise<GitHubAdapterResult> {
  const response = await getJson(`${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, deps);
  if (!isRecord(response.payload)) throw new ReferenceNoContentError();
  const payload = response.payload as GitHubRepoPayload;

  const facts = compactFacts([
    ...repositoryFacts(payload),
    fact("default branch", payload.default_branch),
    fact("created", payload.created_at),
  ]);

  return {
    adapter: "github_repository",
    adapterVersion: REFERENCE_ADAPTER_VERSIONS.github_repository,
    title: `GitHub repository: ${payload.full_name ?? `${owner}/${repo}`}`.slice(0, REFERENCE_LIMITS.MAX_TITLE_CHARS),
    facts,
    text: renderFacts(facts),
    finalUrl: response.finalUrl,
    rateLimit: response.rateLimit,
  };
}

/** Runs whichever GitHub adapter matches, or returns null so the caller falls back to the generic HTTPS adapter. */
export async function importGitHubReference(url: URL, deps: ReferenceFetchDeps = {}): Promise<GitHubAdapterResult | null> {
  const match = matchGitHubReference(url);
  if (!match) return null;
  return match.kind === "profile"
    ? importGitHubProfile(match.login, deps)
    : importGitHubRepository(match.owner, match.repo, deps);
}
