import { NextResponse } from "next/server";
import { and, desc, eq, isNotNull, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { issues, projects, testResults } from "@/db/schema";
import { isProjectViewable } from "@/lib/app-access";
import {
  TESTORA_LABEL,
  createGithubIssue,
  findOpenIssueWithMarker,
  getGithubIssueState,
  resolveGithubTarget,
  type CreatedIssue,
} from "@/lib/github";
import { fingerprintMarker, issueFingerprint, withFingerprintMarker } from "@/lib/issue-fingerprint";

/**
 * Publish an issue to GitHub — unless the same bug is already open there.
 *
 * Duplicate check (lib/issue-fingerprint.ts), in two layers:
 *   1. Testora's own records: an issue with the same fingerprint that we filed
 *      earlier and GitHub still reports as open.
 *   2. GitHub itself: an open `testora`-labelled issue whose body carries the
 *      fingerprint marker (catches reports filed from another environment).
 * A match links this report to the existing issue (`linkedExisting`) and the
 * response carries `duplicateOf`, so the UI can say "already tracked". No
 * match files a new, labelled issue with the marker embedded.
 *
 * Repo + token: the app's own override, else the platform-wide default
 * (TESTORA_GITHUB_REPO / TESTORA_GITHUB_TOKEN) — see resolveGithubTarget.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ issueId: string }> }) {
  const { issueId } = await params;

  const issue = await db.query.issues.findFirst({ where: eq(issues.id, issueId) });
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  if (!(await isProjectViewable(issue.projectId))) {
    return NextResponse.json({ error: "App is locked" }, { status: 403 });
  }

  const project = await db.query.projects.findFirst({ where: eq(projects.id, issue.projectId) });
  const target = resolveGithubTarget(project);
  if (!target) {
    return NextResponse.json(
      { error: "GitHub reporting isn't set up for this app yet — an admin needs to connect a repo." },
      { status: 400 },
    );
  }
  const { repo, token } = target;

  const fingerprint = issue.fingerprint ?? (await fingerprintFromResult(issue));

  let existing: CreatedIssue | null = null;
  if (fingerprint) {
    existing = await findTrackedDuplicate(issue.id, issue.projectId, fingerprint, repo, token);
    existing ??= await findOpenIssueWithMarker({
      owner: repo.owner,
      name: repo.name,
      token,
      marker: fingerprintMarker(fingerprint),
    });
  }

  if (existing) {
    const [updated] = await db
      .update(issues)
      .set({
        status: "published",
        githubUrl: existing.url,
        githubNumber: existing.number,
        githubState: "open",
        fingerprint,
        linkedExisting: true,
        updatedAt: new Date(),
      })
      .where(eq(issues.id, issueId))
      .returning();
    return NextResponse.json({ issue: updated, duplicateOf: existing });
  }

  let created: CreatedIssue;
  try {
    created = await createGithubIssue({
      owner: repo.owner,
      name: repo.name,
      token,
      title: issue.title,
      body: fingerprint ? withFingerprintMarker(issue.body, fingerprint) : issue.body,
      labels: [TESTORA_LABEL],
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create the GitHub issue." },
      { status: 502 },
    );
  }

  const githubState = await getGithubIssueState({
    owner: repo.owner,
    name: repo.name,
    token,
    number: created.number,
  });

  const [updated] = await db
    .update(issues)
    .set({
      status: "published",
      githubUrl: created.url,
      githubNumber: created.number,
      githubState: githubState ?? undefined,
      fingerprint,
      linkedExisting: false,
      updatedAt: new Date(),
    })
    .where(eq(issues.id, issueId))
    .returning();

  return NextResponse.json({ issue: updated, duplicateOf: null });
}

/**
 * Only fingerprint when the failing result is still there: without its error
 * message, a case-only fingerprint would merge unrelated bugs in that case.
 */
async function fingerprintFromResult(issue: {
  projectId: string;
  caseId: string | null;
  resultId: string | null;
}): Promise<string | null> {
  if (!issue.caseId || !issue.resultId) return null;
  const result = await db.query.testResults.findFirst({ where: eq(testResults.id, issue.resultId) });
  if (!result?.errorMessage) return null;
  return issueFingerprint({
    projectId: issue.projectId,
    caseId: issue.caseId,
    errorMessage: result.errorMessage,
  });
}

/** Layer 1: an earlier Testora report of the same bug that is still open on GitHub. */
async function findTrackedDuplicate(
  issueId: string,
  projectId: string,
  fingerprint: string,
  repo: { owner: string; name: string },
  token: string,
): Promise<CreatedIssue | null> {
  const prior = await db
    .select({ url: issues.githubUrl, number: issues.githubNumber })
    .from(issues)
    .where(
      and(
        eq(issues.projectId, projectId),
        eq(issues.fingerprint, fingerprint),
        isNotNull(issues.githubNumber),
        ne(issues.id, issueId),
      ),
    )
    .orderBy(desc(issues.updatedAt))
    .limit(5);

  const seen = new Set<number>();
  for (const row of prior) {
    if (!row.url || row.number == null || seen.has(row.number)) continue;
    seen.add(row.number);
    const state = await getGithubIssueState({ ...repo, token, number: row.number });
    if (state === "open") return { url: row.url, number: row.number };
  }
  return null;
}
