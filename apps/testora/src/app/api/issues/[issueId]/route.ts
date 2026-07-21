import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { issues } from "@/db/schema";
import { isProjectViewable } from "@/lib/app-access";

async function loadIssue(issueId: string) {
  return db.query.issues.findFirst({ where: eq(issues.id, issueId) });
}

export async function GET(_request: Request, { params }: { params: Promise<{ issueId: string }> }) {
  const { issueId } = await params;
  const issue = await loadIssue(issueId);
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  if (!(await isProjectViewable(issue.projectId))) {
    return NextResponse.json({ error: "App is locked" }, { status: 403 });
  }
  return NextResponse.json(issue);
}

const updateSchema = z.object({
  title: z.string().trim().min(1).optional(),
  body: z.string().optional(),
  status: z.enum(["draft", "published"]).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ issueId: string }> }) {
  const { issueId } = await params;
  const issue = await loadIssue(issueId);
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  if (!(await isProjectViewable(issue.projectId))) {
    return NextResponse.json({ error: "App is locked" }, { status: 403 });
  }
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  const [updated] = await db
    .update(issues)
    .set({
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.body !== undefined ? { body: data.body } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      updatedAt: new Date(),
    })
    .where(eq(issues.id, issueId))
    .returning();
  return NextResponse.json({ issue: updated });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ issueId: string }> }) {
  const { issueId } = await params;
  const issue = await loadIssue(issueId);
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  if (!(await isProjectViewable(issue.projectId))) {
    return NextResponse.json({ error: "App is locked" }, { status: 403 });
  }
  await db.delete(issues).where(eq(issues.id, issueId));
  return NextResponse.json({ ok: true });
}
