import { NextResponse } from "next/server";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { targetEnvironments } from "@/db/schema";
import { DEFAULT_PROJECT_ID } from "@/data/projects";

// Target environments (Local / Remote / user-added) a run can be pointed at.
// Built-in entries are seeded per app by seedDatabase(); this route also lets the
// Run page add and remove user-defined targets, which persist in the DB.

// List a project's targets, built-ins first then user-added, each group ordered.
export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("project") || DEFAULT_PROJECT_ID;
  const rows = await db
    .select()
    .from(targetEnvironments)
    .where(eq(targetEnvironments.projectId, projectId))
    .orderBy(asc(targetEnvironments.sortOrder), asc(targetEnvironments.name));
  // Seeded entries first (sortOrder is only meaningful within the seeded group).
  const sorted = rows.slice().sort((a, b) => {
    if (a.seeded !== b.seeded) return a.seeded ? -1 : 1;
    if (a.seeded) return a.sortOrder - b.sortOrder;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  return NextResponse.json(
    sorted.map((t) => ({
      id: t.id,
      projectId: t.projectId,
      name: t.name,
      baseUrl: t.baseUrl,
      apiUrl: t.apiUrl,
      seeded: t.seeded,
    })),
  );
}

const urlField = z.string().trim().url("Must be an absolute URL (http:// or https://)");

const createSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required"),
  baseUrl: urlField,
  apiUrl: urlField,
});

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { projectId, name, baseUrl, apiUrl } = parsed.data;
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `t_${Date.now()}`;
  try {
    const [target] = await db
      .insert(targetEnvironments)
      .values({ id, projectId, name, baseUrl, apiUrl, seeded: false, sortOrder: 0 })
      .returning();
    return NextResponse.json({ target }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create target" }, { status: 500 });
  }
}

const updateSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").optional(),
    baseUrl: urlField.optional(),
    apiUrl: urlField.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

// Edit a user-added target. Built-in (seeded) targets can't be edited — they are
// reconciled from code on each re-seed, so any DB edit would be overwritten.
export async function PATCH(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing target id" }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const [updated] = await db
    .update(targetEnvironments)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(targetEnvironments.id, id), eq(targetEnvironments.seeded, false)))
    .returning();
  if (!updated) {
    return NextResponse.json(
      { error: "Target not found or is a built-in that can't be edited" },
      { status: 404 },
    );
  }
  return NextResponse.json({ target: updated });
}

// Remove a user-added target. Built-in (seeded) targets can't be deleted — they
// are managed by the seed and would just reappear on the next re-seed.
export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing target id" }, { status: 400 });
  }
  const deleted = await db
    .delete(targetEnvironments)
    .where(and(eq(targetEnvironments.id, id), eq(targetEnvironments.seeded, false)))
    .returning({ id: targetEnvironments.id });
  if (deleted.length === 0) {
    return NextResponse.json(
      { error: "Target not found or is a built-in that can't be removed" },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}
