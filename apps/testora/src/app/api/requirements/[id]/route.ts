import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { functionalRequirements } from "@/db/schema";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  baseUrl: z.string().url().optional().or(z.literal("")),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  const [updated] = await db
    .update(functionalRequirements)
    .set(updateValues)
    .where(eq(functionalRequirements.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Requirement not found" }, { status: 404 });
  }
  return NextResponse.json({ functionalRequirement: updated });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [deleted] = await db
    .delete(functionalRequirements)
    .where(eq(functionalRequirements.id, id))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "Requirement not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
