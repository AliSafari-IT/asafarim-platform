import { NextResponse } from "next/server";
import { z } from "zod";
import { getTestFixtures } from "@/lib/queries";
import { db } from "@/db/client";
import { testFixtures } from "@/db/schema";
import { isValidFixtureBaseUrl } from "@/test-engine/resolveFixtureBaseUrl";
import { isProjectViewable } from "@/lib/app-access";

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("project") || undefined;
  if (!(await isProjectViewable(projectId))) {
    return NextResponse.json({ error: "App is locked" }, { status: 403 });
  }
  const fixtures = await getTestFixtures(projectId);
  return NextResponse.json(
    fixtures.map((fixture) => ({
      fixtureId: fixture.fixtureId,
      title: fixture.title,
      caseCount: fixture.cases.length,
      metadata: fixture.metadata,
    })),
  );
}

const createSchema = z.object({
  fixtureId: z.string().min(1).regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens"),
  suiteId: z.string().min(1),
  title: z.string().min(1),
  baseUrl: z
    .string()
    .refine(isValidFixtureBaseUrl, { message: "baseUrl must be an absolute URL or a path starting with /" })
    .optional()
    .or(z.literal("")),
  commonInput: z.record(z.unknown()).default({}),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { baseUrl, ...rest } = parsed.data;

  try {
    const [fixture] = await db
      .insert(testFixtures)
      .values({ ...rest, baseUrl: baseUrl || null })
      .returning();
    return NextResponse.json({ fixture }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: isUniqueViolation(error) ? `A fixture with id "${parsed.data.fixtureId}" already exists.` : "Failed to create fixture" },
      { status: isUniqueViolation(error) ? 409 : 500 },
    );
  }
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code: string }).code === "23505");
}
