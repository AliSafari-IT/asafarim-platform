import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { issues, projects } from "@/db/schema";
import { isProjectViewable } from "@/lib/app-access";
import { createGithubIssue, decryptToken, getGithubIssueState, parseRepo } from "@/lib/github";

// Publish an issue to its app's GitHub repo. Requires the app to have a repo +
// token configured; otherwise the issue stays as the local markdown fallback.
export async function POST(_request: Request, { params }: { params: Promise<{ issueId: string }> }) {
  const { issueId } = await params;

  const issue = await db.query.issues.findFirst({ where: eq(issues.id, issueId) });
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  if (!(await isProjectViewable(issue.projectId))) {
    return NextResponse.json({ error: "App is locked" }, { status: 403 });
  }

  const project = await db.query.projects.findFirst({ where: eq(projects.id, issue.projectId) });
  const repo = parseRepo(project?.githubRepo);
  const token = decryptToken(project?.githubTokenEnc);
  if (!repo || !token) {
    return NextResponse.json(
      { error: "Connect a GitHub repo and token for this app (in Apps) before publishing." },
      { status: 400 },
    );
  }

  let created;
  try {
    created = await createGithubIssue({
      owner: repo.owner,
      name: repo.name,
      token,
      title: issue.title,
      body: issue.body,
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
      updatedAt: new Date(),
    })
    .where(eq(issues.id, issueId))
    .returning();

  return NextResponse.json({ issue: updated });
}
