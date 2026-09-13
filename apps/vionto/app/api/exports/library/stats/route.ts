import { NextResponse } from "next/server";
import { prisma } from "@asafarim/db";
import { getAuthedUser, unauthorized, serverError } from "@/lib/server/auth";
import { buildLibraryWhere, parseLibraryFilters } from "../shared";

export const runtime = "nodejs";

/**
 * GET /api/exports/library/stats — aggregate counts for the current user's
 * filtered library, computed server-side rather than by paging through
 * every row client-side. Accepts the same filter params as the list route
 * so the stats strip reflects exactly what "Showing N of M" describes.
 */
export async function GET(req: Request) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { searchParams } = new URL(req.url);
    const where = buildLibraryWhere(parseLibraryFilters(searchParams), user.id);

    const [aggregate, distinctProjects] = await Promise.all([
      prisma.viontoExport.aggregate({
        where,
        _count: { _all: true },
        _sum: { durationSeconds: true, fileSizeBytes: true },
      }),
      prisma.viontoExport.findMany({
        where,
        distinct: ["projectId"],
        select: { projectId: true },
      }),
    ]);

    return NextResponse.json({
      totalVideos: aggregate._count._all,
      totalDurationSeconds: aggregate._sum.durationSeconds ?? 0,
      totalOutputBytes: aggregate._sum.fileSizeBytes ?? 0,
      uniqueProjectCount: distinctProjects.length,
    });
  } catch (error) {
    return serverError("exports/library/stats", error);
  }
}
