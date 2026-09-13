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

    // AI-motion stats are scoped to the user only, not the export list's
    // filters (project/date/etc.) — a clip isn't a ViontoExport row, so
    // "matching the current export filters" doesn't have a precise meaning
    // for it yet. Deliberately simpler than the rest of this endpoint;
    // revisit if the UI ever needs the two to stay in lockstep.
    const succeededAiClipsWhere = { userId: user.id, status: "succeeded" } as const;

    const [aggregate, distinctProjects, aiClipsAggregate, unknownCostCount] = await Promise.all([
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
      prisma.viontoAiClip.aggregate({
        where: succeededAiClipsWhere,
        _count: { _all: true },
        _sum: { outputDurationSeconds: true, estimatedCostUsdMicros: true },
      }),
      prisma.viontoAiClip.count({
        where: { ...succeededAiClipsWhere, estimatedCostUsdMicros: null },
      }),
    ]);

    // A second query rather than a field count: Prisma's per-field `_count`
    // counts non-null values, and `accepted` (a non-nullable Boolean) is
    // never null — that would just equal `_count._all`, not "accepted=true".
    const acceptedAiClips =
      aiClipsAggregate._count._all === 0
        ? 0
        : await prisma.viontoAiClip.count({ where: { ...succeededAiClipsWhere, accepted: true } });

    const succeededAiClips = aiClipsAggregate._count._all;
    const estimatedCostUsd =
      succeededAiClips === 0
        ? 0
        : aiClipsAggregate._sum.estimatedCostUsdMicros != null
          ? Number(aiClipsAggregate._sum.estimatedCostUsdMicros) / 1_000_000
          : null;

    return NextResponse.json({
      totalVideos: aggregate._count._all,
      totalDurationSeconds: aggregate._sum.durationSeconds ?? 0,
      totalOutputBytes: aggregate._sum.fileSizeBytes ?? 0,
      uniqueProjectCount: distinctProjects.length,
      aiMotion: {
        succeededClips: succeededAiClips,
        acceptedClips: acceptedAiClips,
        durationSeconds: aiClipsAggregate._sum.outputDurationSeconds ?? 0,
        // Null means "some or all succeeded clips have no cost snapshot" —
        // distinct from a real $0. Never label this "Total cost" in the UI:
        // it's only ever an estimate from the registry price at generation
        // time, and only for the categories/providers that had a price.
        estimatedCostUsd,
        unknownCostCount,
      },
    });
  } catch (error) {
    return serverError("exports/library/stats", error);
  }
}
