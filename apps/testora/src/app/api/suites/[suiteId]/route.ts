import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { testSuites } from "@/db/schema";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  frId: z.string().min(1).optional(),
  // Suite-level manual quarantine (issue #260) — excludes every case under
  // the suite from a green-light check without touching each one.
  quarantined: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ suiteId: string }> }) {
  const { suiteId } = await params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { quarantined, ...rest } = parsed.data;

  try {
    const [updated] = await db
      .update(testSuites)
      .set({
        ...rest,
        ...(quarantined !== undefined
          ? { quarantined, quarantinedAt: quarantined ? new Date() : null }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(testSuites.suiteId, suiteId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Suite not found" }, { status: 404 });
    }
    return NextResponse.json({ suite: updated });
  } catch (error) {
    return NextResponse.json(
      { error: isForeignKeyViolation(error) ? "Target functional requirement does not exist." : "Failed to update suite" },
      { status: isForeignKeyViolation(error) ? 400 : 500 },
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ suiteId: string }> }) {
  const { suiteId } = await params;
  const [deleted] = await db.delete(testSuites).where(eq(testSuites.suiteId, suiteId)).returning();

  if (!deleted) {
    return NextResponse.json({ error: "Suite not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

function isForeignKeyViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code: string }).code === "23503");
}
