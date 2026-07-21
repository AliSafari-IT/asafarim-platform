import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { issues, projects } from "@/db/schema";
import { isProjectViewable } from "@/lib/app-access";
import { decryptToken, getGithubIssueState, parseRepo } from "@/lib/github";

export async function GET(_request: Request, { params }: { params: Promise<{ issueId: string }> }) {
  const { issueId } = await params;

  const issue = await db.query.issues.findFirst({ where: eq(issues.id, issueId) });
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  if (!(await isProjectViewable(issue.projectId))) {
    return NextResponse.json({ error: "App is locked" }, { status: 403 });
  }

  if (!issue.githubNumber) {
    return NextResponse.json({ state: null });
  }

  const project = await db.query.projects.findFirst({ where: eq(projects.id, issue.projectId) });
  const repo = parseRepo(project?.githubRepo);
  const token = decryptToken(project?.githubTokenEnc);
  if (!repo || !token) {
    return NextResponse.json({ state: issue.githubState ?? null });
  }

  const state = await getGithubIssueState({
    owner: repo.owner,
    name: repo.name,
    token,
    number: issue.githubNumber,
  });

  if (state) {
    await db
      .update(issues)
      .set({ githubState: state, updatedAt: new Date() })
      .where(eq(issues.id, issueId));
  }

  return NextResponse.json({ state: state ?? issue.githubState ?? null });
}
