#!/usr/bin/env node
// Reads .github/CODEOWNERS' default (`*`) rule as the source of truth for
// who may approve a PR, expands any @org/team entries to their member
// list, and checks the PR for an APPROVED review from someone in that
// pool. When the pool collapses to just the PR's own author (the
// solo-maintainer case), the check passes automatically instead of
// permanently blocking on "someone else must approve" when no one else
// exists. A missing/empty CODEOWNERS file is a hard failure (misconfigured),
// never "no rule, so allow everything." See .github/workflows/codeowners-gate.yml
// and issue #551.

import { readFileSync, existsSync, appendFileSync } from "node:fs";

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY; // "owner/name"
const prNumber = process.env.PR_NUMBER;
const prAuthor = process.env.PR_AUTHOR;

if (!token || !repo || !prNumber || !prAuthor) {
  console.error("Missing required env vars: GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER, PR_AUTHOR");
  process.exit(2);
}

const [owner] = repo.split("/");
const apiBase = "https://api.github.com";
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

const lines = [];
function log(msg) {
  console.log(msg);
  lines.push(msg);
}

async function ghGet(path) {
  const res = await fetch(`${apiBase}${path}`, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API ${path} -> ${res.status} ${res.statusText}`);
  }
  return res.json();
}

function parseCodeownersDefaultRule(text) {
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    const [pattern, ...owners] = parts;
    if (pattern === "*") {
      return owners.filter((o) => o.startsWith("@"));
    }
  }
  return null;
}

async function expandOwners(rawOwners) {
  const expanded = new Set();
  for (const raw of rawOwners) {
    const name = raw.slice(1); // strip leading @
    if (name.includes("/")) {
      // @org/team -> expand to member logins
      const [org, teamSlug] = name.split("/");
      const members = await ghGet(`/orgs/${org}/teams/${teamSlug}/members`);
      for (const m of members) expanded.add(m.login.toLowerCase());
    } else if (name.includes("@")) {
      // email-style CODEOWNERS entry: not resolvable to a login, skip
      continue;
    } else {
      expanded.add(name.toLowerCase());
    }
  }
  return expanded;
}

async function main() {
  log("## CODEOWNERS approval gate");
  log("");

  if (!existsSync(".github/CODEOWNERS")) {
    log("### ❌ .github/CODEOWNERS is missing");
    log("Treated as a hard failure (misconfigured), never as \"no rule, so allow everything.\"");
    return fail();
  }

  const raw = readFileSync(".github/CODEOWNERS", "utf8");
  const rawOwners = parseCodeownersDefaultRule(raw);

  if (!rawOwners || rawOwners.length === 0) {
    log("### ❌ .github/CODEOWNERS has no default (`*`) rule, or it names no owners");
    log("Treated as a hard failure (misconfigured), never as \"no rule, so allow everything.\"");
    return fail();
  }

  let pool;
  try {
    pool = await expandOwners(rawOwners);
  } catch (err) {
    log(`### ❌ Failed to expand CODEOWNERS entries: ${err.message}`);
    log("Treated as a hard failure (misconfigured) rather than silently allowing the PR through.");
    return fail();
  }

  if (pool.size === 0) {
    log("### ❌ CODEOWNERS default rule resolved to an empty pool");
    return fail();
  }

  log(`Default-rule pool (from \`.github/CODEOWNERS\`): ${[...pool].map((p) => `\`${p}\``).join(", ")}`);
  log(`PR author: \`${prAuthor.toLowerCase()}\``);
  log("");

  const authorLower = prAuthor.toLowerCase();
  if (pool.size === 1 && pool.has(authorLower)) {
    log("### ✅ Solo-maintainer escape hatch applied");
    log("The CODEOWNERS pool for this path collapses to just the PR author, so no second approval is required.");
    return pass();
  }

  const reviews = await ghGet(`/repos/${repo}/pulls/${prNumber}/reviews`);

  // A reviewer's most recent review state is what counts; a later CHANGES_REQUESTED
  // or COMMENTED review supersedes an earlier APPROVED one from the same person.
  const latestByReviewer = new Map();
  for (const r of reviews) {
    if (!r.user?.login) continue;
    latestByReviewer.set(r.user.login.toLowerCase(), r.state);
  }

  const approvers = [...latestByReviewer.entries()]
    .filter(([, state]) => state === "APPROVED")
    .map(([login]) => login);

  const qualifyingApprover = approvers.find((login) => pool.has(login));

  if (qualifyingApprover) {
    log(`### ✅ Approved by \`${qualifyingApprover}\`, a member of the CODEOWNERS pool`);
    return pass();
  }

  log("### ❌ No qualifying approval from the CODEOWNERS pool");
  log(
    approvers.length > 0
      ? `Approvals came from: ${approvers.map((a) => `\`${a}\``).join(", ")} — none are in the CODEOWNERS pool.`
      : "No APPROVED reviews found on this PR."
  );
  return fail();
}

function writeSummary() {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  const output = lines.join("\n") + "\n";
  if (summaryPath) {
    appendFileSync(summaryPath, output);
  }
}

function pass() {
  writeSummary();
  process.exit(0);
}

function fail() {
  writeSummary();
  process.exit(1);
}

main().catch((err) => {
  log(`### ❌ Unexpected error: ${err.message}`);
  fail();
});
