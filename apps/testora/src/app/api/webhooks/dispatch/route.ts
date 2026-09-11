import { NextResponse } from "next/server";
import { dispatchPendingEvents } from "@/lib/webhook-dispatcher";

export const dynamic = "force-dynamic";

/**
 * Manual/cron redrive (issue #261). Deliveries also fire inline right after
 * an event is enqueued; this exists to retry anything still `pending` after
 * a prior failure's backoff, without a dedicated worker process.
 */
export async function POST() {
  const summary = await dispatchPendingEvents();
  return NextResponse.json({ data: summary });
}
