import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/server/profiles";
import { handleEduError, serverError } from "@/lib/server";
import { listAdminTransactions, getAdminWallets } from "@/lib/server/admin-queries";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireRole("ADMIN");
    const { searchParams } = new URL(req.url);
    const view = searchParams.get("view"); // "wallets" for wallet overview
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);
    const offset = parseInt(searchParams.get("offset") ?? "0");

    if (view === "wallets") {
      const data = await getAdminWallets({ limit, offset });
      return NextResponse.json(data);
    }

    const type = searchParams.get("type") || undefined;
    const tutorId = searchParams.get("tutorId") || undefined;
    const bookingId = searchParams.get("bookingId") || undefined;
    const data = await listAdminTransactions({ limit, offset, type, tutorId, bookingId });
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("admin/transactions", error);
    }
    return serverError("admin/transactions", error);
  }
}
