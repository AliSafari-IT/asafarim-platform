import "server-only";
import crypto from "node:crypto";

// GitHub wiring for filing issues from failed results. A per-app Personal Access
// Token (PAT) is stored encrypted at rest and only ever decrypted server-side to
// call the GitHub API — it is never returned to the browser.

// Same signing/secret convention as src/lib/app-access.ts. Set TESTORA_SECRET in
// production; the dev fallback is fine locally but must not protect real tokens.
const SECRET = process.env.TESTORA_SECRET || "testora-insecure-dev-secret-change-me";

// A stable 32-byte key derived from the secret for AES-256-GCM.
const KEY = crypto.scryptSync(SECRET, "testora-github-token", 32);

// ── Token encryption (AES-256-GCM) ───────────────────────────────────────────

/** Encrypt a PAT for storage: `gcm$iv$tag$ciphertext` (all hex). */
export function encryptToken(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `gcm$${iv.toString("hex")}$${tag.toString("hex")}$${enc.toString("hex")}`;
}

/** Decrypt a stored PAT; returns null if the value is malformed or tampered. */
export function decryptToken(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const [scheme, ivHex, tagHex, dataHex] = stored.split("$");
  if (scheme !== "gcm" || !ivHex || !tagHex || !dataHex) return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    return null;
  }
}

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
}): Promise<CreatedIssue> {
  const { owner, name, token, title, body } = params;
  const res = await fetch(`https://api.github.com/repos/${owner}/${name}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "e2e-testora",
    },
    body: JSON.stringify({ title, body }),
  });

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
