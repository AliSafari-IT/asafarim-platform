import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { testSuites } from "@/db/schema";
import { getSuiteSummaries } from "@/lib/queries";
import { isProjectViewable } from "@/lib/app-access";

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("project") || undefined;
  if (!(await isProjectViewable(projectId))) {
    return NextResponse.json({ error: "App is locked" }, { status: 403 });
  }
  return NextResponse.json(await getSuiteSummaries(projectId));
}

const createSchema = z.object({
  suiteId: z.string().min(1).regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens"),
  frId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const [suite] = await db.insert(testSuites).values(parsed.data).returning();
    return NextResponse.json({ suite }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: isUniqueViolation(error) ? `A suite with id "${parsed.data.suiteId}" already exists.` : "Failed to create suite" },
      { status: isUniqueViolation(error) ? 409 : 500 },
    );
  }
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code: string }).code === "23505");
}
