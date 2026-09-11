import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { outboundDeliveries } from "@/db/schema";

/** Delivery log (issue #261 — the "/settings/webhooks" acceptance surface). */
export async function GET(request: Request) {
  const webhookId = new URL(request.url).searchParams.get("webhookId");
  const limitParam = Number(new URL(request.url).searchParams.get("limit") ?? 100);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 100;

  const rows = await db.query.outboundDeliveries.findMany({
    where: webhookId ? eq(outboundDeliveries.webhookId, webhookId) : undefined,
    orderBy: desc(outboundDeliveries.createdAt),
    limit,
  });
  return NextResponse.json({ deliveries: rows });
}
