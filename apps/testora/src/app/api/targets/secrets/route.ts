import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { targetEnvironments, targetSecrets } from "@/db/schema";
import { encryptToken } from "@/lib/crypto";
import { secretNameError } from "@/lib/run-secrets";
import { canManageCatalog } from "@/lib/viewer-role";

// Per-target test credentials (#702). Admin-only — the proxy refuses members
// (src/lib/access-policy.ts ADMIN_READS + no member/tester write), and each
// handler re-checks. Values are WRITE-ONLY: stored encrypted, never returned;
// GET lists names and timestamps only.

async function forbidden() {
  return (await canManageCatalog())
    ? null
    : NextResponse.json({ error: "Only admins can manage target secrets." }, { status: 403 });
}

// List a target's secret NAMES (never values).
export async function GET(request: Request) {
  const denied = await forbidden();
  if (denied) return denied;
  const targetId = new URL(request.url).searchParams.get("targetId");
  if (!targetId) return NextResponse.json({ error: "Missing targetId" }, { status: 400 });
  const rows = await db
    .select({ name: targetSecrets.name, updatedAt: targetSecrets.updatedAt })
    .from(targetSecrets)
    .where(eq(targetSecrets.targetId, targetId))
    .orderBy(asc(targetSecrets.name));
  return NextResponse.json(rows);
}

const putSchema = z.object({
  targetId: z.string().min(1),
  name: z.string().trim(),
  value: z.string().min(1, "Value is required").max(4096),
});

// Create or replace one secret.
export async function PUT(request: Request) {
  const denied = await forbidden();
  if (denied) return denied;
  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { targetId, name, value } = parsed.data;
  const nameError = secretNameError(name);
  if (nameError) return NextResponse.json({ error: nameError }, { status: 400 });

  const target = await db.query.targetEnvironments.findFirst({
    where: eq(targetEnvironments.id, targetId),
    columns: { id: true },
  });
  if (!target) return NextResponse.json({ error: "Target not found" }, { status: 404 });

  const now = new Date();
  await db
    .insert(targetSecrets)
    .values({ id: randomUUID(), targetId, name, valueEnc: encryptToken(value), updatedAt: now })
    .onConflictDoUpdate({
      target: [targetSecrets.targetId, targetSecrets.name],
      set: { valueEnc: encryptToken(value), updatedAt: now },
    });
  return NextResponse.json({ name, updatedAt: now });
}

// Remove one secret.
export async function DELETE(request: Request) {
  const denied = await forbidden();
  if (denied) return denied;
  const params = new URL(request.url).searchParams;
  const targetId = params.get("targetId");
  const name = params.get("name");
  if (!targetId || !name) {
    return NextResponse.json({ error: "Missing targetId or name" }, { status: 400 });
  }
  const deleted = await db
    .delete(targetSecrets)
    .where(and(eq(targetSecrets.targetId, targetId), eq(targetSecrets.name, name)))
    .returning({ name: targetSecrets.name });
  if (deleted.length === 0) return NextResponse.json({ error: "Secret not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
