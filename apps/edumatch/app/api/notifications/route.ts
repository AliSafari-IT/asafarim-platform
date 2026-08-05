import { NextResponse } from "next/server";
import { serverError } from "@/lib/server";
import { requireAuth, unauthorized } from "@/lib/server/auth";
import {
  listNotifications,
  countUnreadNotifications,
  markAllNotificationsRead,
} from "@/lib/server/notifications";

export const runtime = "nodejs";

/**
 * GET /api/notifications
 *
 * List notifications for the current user.
 * Query params:
 *   unreadOnly=true — only return unread notifications
 *   limit=20        — max results
 *   offset=0        — pagination offset
 */
export async function GET(req: Request) {
  try {
    const user = await requireAuth();

    const { searchParams } = new URL(req.url);
    const unreadOnly = searchParams.get("unreadOnly") === "true";
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);

    const [items, unreadCount] = await Promise.all([
      listNotifications(user.id, { unreadOnly, limit, offset }),
      countUnreadNotifications(user.id),
    ]);

    return NextResponse.json({ items, unreadCount, total: items.length });
  } catch (error) {
    return serverError("notifications", error);
  }
}

/**
 * POST /api/notifications/mark-all-read
 *
 * Mark all notifications as read for the current user.
 */
export async function POST(req: Request) {
  try {
    const user = await requireAuth();

    const body = (await req.json().catch(() => ({}))) as { action?: string };
    if (body.action === "mark-all-read") {
      await markAllNotificationsRead(user.id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return serverError("notifications", error);
  }
}
