import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { functionalRequirements } from "@/db/schema";
import { getRequirementSummaries } from "@/lib/queries";
import { isProjectViewable } from "@/lib/app-access";

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("project") || undefined;
  if (!(await isProjectViewable(projectId))) {
    return NextResponse.json({ error: "App is locked" }, { status: 403 });
  }
  return NextResponse.json(await getRequirementSummaries(projectId));
}

const createSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens"),
  title: z.string().min(1),
  description: z.string().default(""),
  baseUrl: z.string().url().optional().or(z.literal("")),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { baseUrl, ...rest } = parsed.data;

  try {
    const [fr] = await db
      .insert(functionalRequirements)
      .values({ ...rest, baseUrl: baseUrl || null })
      .returning();
    return NextResponse.json({ functionalRequirement: fr }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: isUniqueViolation(error) ? `A requirement with id "${parsed.data.id}" already exists.` : "Failed to create requirement" },
      { status: isUniqueViolation(error) ? 409 : 500 },
    );
  }
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code: string }).code === "23505");
}
