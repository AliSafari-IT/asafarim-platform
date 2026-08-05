import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/server/profiles";
import { handleEduError, serverError } from "@/lib/server";
import { listEduAuditEvents } from "@/lib/server/audit";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireRole("ADMIN");
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);
    const offset = parseInt(searchParams.get("offset") ?? "0");
    const entity = searchParams.get("entity") || undefined;
    const entityId = searchParams.get("entityId") || undefined;
    const action = searchParams.get("action") || undefined;
    const actorId = searchParams.get("actorId") || undefined;
    const events = await listEduAuditEvents({ entity, entityId, action, actorId, limit, offset });
    return NextResponse.json({ events, total: events.length });
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("admin/audit", error);
    }
    return serverError("admin/audit", error);
  }
}
