import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { issues } from "@/db/schema";
import { isProjectViewable } from "@/lib/app-access";

// List an app's issues. Withheld for a private app the viewer hasn't unlocked.
export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("project");
  if (!projectId) return NextResponse.json({ error: "Missing project id" }, { status: 400 });
  if (!(await isProjectViewable(projectId))) {
    return NextResponse.json({ error: "App is locked" }, { status: 403 });
  }
  const rows = await db
    .select({
      id: issues.id,
      title: issues.title,
      status: issues.status,
      githubUrl: issues.githubUrl,
      githubNumber: issues.githubNumber,
      githubState: issues.githubState,
      createdAt: issues.createdAt,
      updatedAt: issues.updatedAt,
    })
    .from(issues)
    .where(eq(issues.projectId, projectId))
    .orderBy(desc(issues.createdAt));
  return NextResponse.json(rows);
}

const createSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().trim().min(1, "Title is required"),
  body: z.string().default(""),
  resultId: z.string().optional(),
  caseId: z.string().optional(),
});

// Create a draft issue (the markdown-only fallback; publishing to GitHub is a
// separate step).
export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  if (!(await isProjectViewable(data.projectId))) {
    return NextResponse.json({ error: "App is locked" }, { status: 403 });
  }
  const [created] = await db
    .insert(issues)
    .values({
      id: randomUUID(),
      projectId: data.projectId,
      title: data.title,
      body: data.body,
      status: "draft",
      resultId: data.resultId ?? null,
      caseId: data.caseId ?? null,
    })
    .returning();
  return NextResponse.json({ issue: created }, { status: 201 });
}
