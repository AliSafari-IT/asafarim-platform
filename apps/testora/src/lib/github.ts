import "server-only";

// GitHub wiring for filing issues from failed results. A per-app Personal Access
// Token (PAT) is stored encrypted at rest and only ever decrypted server-side to
// call the GitHub API — it is never returned to the browser.

// Token encryption lives in lib/crypto.ts (shared with target secrets, #702).
export { encryptToken, decryptToken } from "@/lib/crypto";
import { decryptToken } from "@/lib/crypto";

// ── Repo parsing + issue creation ─────────────────────────────────────────────

export interface RepoRef {
  owner: string;
  name: string;
}

/** Accepts "owner/name", a full https URL, or a git@ URL; returns null if unparseable. */
export function parseRepo(input: string | null | undefined): RepoRef | null {
  if (!input) return null;
  let s = input.trim();
  s = s.replace(/^git@github\.com:/i, "").replace(/^https?:\/\/github\.com\//i, "");
  s = s.replace(/\.git$/i, "").replace(/^\/+|\/+$/g, "");
  const parts = s.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const [owner, name] = parts;
  if (!owner || !name) return null;
  return { owner, name };
}

// ── Where issues go ──────────────────────────────────────────────────────────
//
// Every app Testora tests is an ASafariM product, so bugs default to one
// platform repo configured once via env (TESTORA_GITHUB_REPO +
// TESTORA_GITHUB_TOKEN). An app can still override it with its own repo +
// encrypted PAT (set by an admin in Apps).

export interface GithubTarget {
  repo: RepoRef;
  token: string;
  source: "app" | "platform";
}

function platformTarget(): GithubTarget | null {
  const repo = parseRepo(process.env.TESTORA_GITHUB_REPO);
  const token = process.env.TESTORA_GITHUB_TOKEN?.trim();
  return repo && token ? { repo, token, source: "platform" } : null;
}

/** Whether the platform-wide default repo + token are configured. */
export function isPlatformGithubConfigured(): boolean {
  return platformTarget() !== null;
}

/** The repo + token an app's issues are filed with, or null if none is set. */
export function resolveGithubTarget(
  project: { githubRepo?: string | null; githubTokenEnc?: string | null } | null | undefined,
): GithubTarget | null {
  const repo = parseRepo(project?.githubRepo);
  const token = decryptToken(project?.githubTokenEnc);
  if (repo && token) return { repo, token, source: "app" };
  return platformTarget();
}

/** Label Testora puts on every issue it files; scoped duplicate lookups use it. */
export const TESTORA_LABEL = "testora";

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "e2e-testora",
  };
}

/**
 * Find an OPEN issue carrying `marker` in its body among the repo's open
 * Testora-labelled issues. Uses the list endpoint rather than search, which
 * lags by minutes and would let near-simultaneous reports slip through.
 * Returns null when none matches or GitHub can't be reached — publishing
 * then simply files a new issue.
 */
export async function findOpenIssueWithMarker(params: {
  owner: string;
  name: string;
  token: string;
  marker: string;
  maxPages?: number;
}): Promise<CreatedIssue | null> {
  const { owner, name, token, marker, maxPages = 5 } = params;
  for (let page = 1; page <= maxPages; page++) {
    const url =
      `https://api.github.com/repos/${owner}/${name}/issues` +
      `?state=open&labels=${encodeURIComponent(TESTORA_LABEL)}&per_page=100&page=${page}`;
    const res = await fetch(url, { headers: githubHeaders(token) }).catch(() => null);
    if (!res?.ok) return null;
    const items = (await res.json()) as {
      body?: string | null;
      html_url?: string;
      number?: number;
      pull_request?: unknown;
    }[];
    const hit = items.find(
      (item) => !item.pull_request && typeof item.body === "string" && item.body.includes(marker),
    );
    if (hit?.html_url && typeof hit.number === "number") {
      return { url: hit.html_url, number: hit.number };
    }
    if (items.length < 100) return null;
  }
  return null;
}

/** A readable, repo-agnostic label for a configured repo (or null). */
export function repoLabel(input: string | null | undefined): string | null {
  const ref = parseRepo(input);
  return ref ? `${ref.owner}/${ref.name}` : null;
}

export interface CreatedIssue {
  url: string;
  number: number;
}

export type GithubIssueState = "open" | "closed";

/**
 * Fetch the current state of a GitHub issue. Returns null if the request fails
 * so the UI can fall back to the last known state.
 */
export async function getGithubIssueState(params: {
  owner: string;
  name: string;
  token: string;
  number: number;
}): Promise<GithubIssueState | null> {
  const { owner, name, token, number } = params;
  const res = await fetch(`https://api.github.com/repos/${owner}/${name}/issues/${number}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "e2e-testora",
    },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { state?: unknown };
  if (data.state === "open" || data.state === "closed") return data.state;
  return null;
}

/**
 * File an issue on GitHub. Throws an Error with a human-readable message on the
 * common failures (bad token, missing repo/scope, validation, rate limit) so the
 * UI can show it directly.
 */
export async function createGithubIssue(params: {
  owner: string;
  name: string;
  token: string;
  title: string;
  body: string;
  labels?: string[];
}): Promise<CreatedIssue> {
  const { owner, name, token, title, body, labels } = params;
  const res = await fetch(`https://api.github.com/repos/${owner}/${name}/issues`, {
    method: "POST",
    headers: { ...githubHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(labels?.length ? { title, body, labels } : { title, body }),
  });

  // A label the repo rejects must never block a bug report: retry without it
  // (the DB-side duplicate check still works; only the GitHub scan loses it).
  if (res.status === 422 && labels?.length) {
    return createGithubIssue({ owner, name, token, title, body });
  }

  if (res.status === 401) {
    throw new Error("GitHub rejected the token (401). Check the app's PAT is valid and not expired.");
  }
  if (res.status === 403) {
    throw new Error("GitHub denied the request (403) — the token may lack 'repo'/'issues' scope or be rate-limited.");
  }
  if (res.status === 404) {
    throw new Error(`Repo ${owner}/${name} not found, or the token can't see it (404).`);
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    const msg = detail && typeof detail === "object" && "message" in detail ? String((detail as { message: unknown }).message) : "";
    throw new Error(`GitHub returned ${res.status}${msg ? `: ${msg}` : ""}.`);
  }

  const data = (await res.json()) as { html_url?: string; number?: number };
  if (!data.html_url || typeof data.number !== "number") {
    throw new Error("GitHub created the issue but returned an unexpected response.");
  }
  return { url: data.html_url, number: data.number };
}
