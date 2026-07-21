import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { testFixtures } from "@/db/schema";
import { isValidFixtureBaseUrl } from "@/test-engine/resolveFixtureBaseUrl";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  baseUrl: z
    .string()
    .refine(isValidFixtureBaseUrl, { message: "baseUrl must be an absolute URL or a path starting with /" })
    .optional()
    .or(z.literal("")),
  commonInput: z.record(z.unknown()).optional(),
  suiteId: z.string().min(1).optional(),
  setupScript: z.string().optional(),
  teardownScript: z.string().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ fixtureId: string }> }) {
  const { fixtureId } = await params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { baseUrl, ...rest } = parsed.data;
  const updateValues: Record<string, unknown> = { ...rest, updatedAt: new Date() };
  if (baseUrl !== undefined) updateValues.baseUrl = baseUrl || null;

  try {
    const [updated] = await db
      .update(testFixtures)
      .set(updateValues)
      .where(eq(testFixtures.fixtureId, fixtureId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Fixture not found" }, { status: 404 });
    }
    return NextResponse.json({ fixture: updated });
  } catch (error) {
    return NextResponse.json(
      { error: isForeignKeyViolation(error) ? "Target suite does not exist." : "Failed to update fixture" },
      { status: isForeignKeyViolation(error) ? 400 : 500 },
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ fixtureId: string }> }) {
  const { fixtureId } = await params;
  const [deleted] = await db.delete(testFixtures).where(eq(testFixtures.fixtureId, fixtureId)).returning();

  if (!deleted) {
    return NextResponse.json({ error: "Fixture not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

function isForeignKeyViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code: string }).code === "23503");
}
