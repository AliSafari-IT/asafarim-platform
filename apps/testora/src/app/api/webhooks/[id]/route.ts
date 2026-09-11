import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { outboundWebhooks } from "@/db/schema";

const updateSchema = z.object({
  url: z.string().trim().url().optional(),
  secret: z.string().min(16).optional(),
  // Disabling stops deliveries without losing the endpoint config or its
  // delivery log (issue #261 acceptance).
  enabled: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }
  const [updated] = await db
    .update(outboundWebhooks)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(outboundWebhooks.id, id))
    .returning();
  if (!updated) {
    return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
  }
  return NextResponse.json({
    webhook: {
      id: updated.id,
      projectId: updated.projectId,
      url: updated.url,
      enabled: updated.enabled,
      secretConfigured: updated.secret.length > 0,
      updatedAt: updated.updatedAt,
    },
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [deleted] = await db.delete(outboundWebhooks).where(eq(outboundWebhooks.id, id)).returning();
  if (!deleted) {
    return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
