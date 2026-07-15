import { NextResponse } from "next/server";
import { prisma } from "@asafarim/db";
import { getAuthedUser, unauthorized, badRequest, serverError } from "@/lib/server/auth";
import { sortAlbumItemsSchema, formatZodError } from "@/lib/server/validation";
import { getAssetExif } from "@/lib/server/exif";

export const runtime = "nodejs";

type Params = { params: Promise<{ projectId: string; albumId: string }> };

type LocationGroup = {
  label: string;
  latitude: number | null;
  longitude: number | null;
  startIndex: number;
  count: number;
};

/**
 * POST /api/projects/[projectId]/albums/[albumId]/items/sort
 *
 * Auto-sorts album items by EXIF date or clusters them by GPS location.
 * Persists the new order via orderIndex updates.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { projectId, albumId } = await params;

    // Verify album ownership.
    const album = await prisma.viontoAlbum.findFirst({
      where: { id: albumId, projectId, userId: user.id },
      select: { id: true, isBase: true },
    });
    if (!album) return badRequest("Album not found.");

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = sortAlbumItemsSchema.safeParse(body);
    if (!parsed.success) return badRequest(formatZodError(parsed.error));

    const { mode } = parsed.data;

    // Fetch all album items with their asset EXIF metadata.
    const items = await prisma.viontoAlbumItem.findMany({
      where: { albumId },
      select: {
        id: true,
        asset: {
          select: {
            metadata: true,
            createdAt: true,
          },
        },
      },
    });

    if (items.length < 2) {
      return NextResponse.json({ ok: true, orderedItemIds: items.map((i) => i.id) });
    }

    // Extract sortable data from each item.
    const enriched = items.map((item) => {
      const exif = getAssetExif(item.asset.metadata);
      return {
        id: item.id,
        timestamp: exif?.timestamp ?? item.asset.createdAt.toISOString().split("T")[0],
        hasExifTimestamp: !!exif?.timestamp,
        gpsLatitude: exif?.gpsLatitude ?? null,
        gpsLongitude: exif?.gpsLongitude ?? null,
      };
    });

    let orderedIds: string[];
    let groups: LocationGroup[] | undefined;

    if (mode === "date_asc" || mode === "date_desc") {
      // Sort by date — items with EXIF timestamps first, then fallback items.
      enriched.sort((a, b) => {
        // Both have same source priority — compare timestamps.
        const cmp = a.timestamp.localeCompare(b.timestamp);
        return mode === "date_asc" ? cmp : -cmp;
      });
      orderedIds = enriched.map((e) => e.id);
    } else {
      // Location mode — cluster by GPS proximity.
      const withGps: typeof enriched = [];
      const withoutGps: typeof enriched = [];

      for (const item of enriched) {
        if (item.gpsLatitude !== null && item.gpsLongitude !== null) {
          withGps.push(item);
        } else {
          withoutGps.push(item);
        }
      }

      // Cluster GPS items by rounding to 2 decimal places (~1.1km precision).
      const clusters = new Map<string, typeof enriched>();
      for (const item of withGps) {
        const key = `${item.gpsLatitude!.toFixed(2)},${item.gpsLongitude!.toFixed(2)}`;
        const cluster = clusters.get(key) ?? [];
        cluster.push(item);
        clusters.set(key, cluster);
      }

      // Sort items within each cluster chronologically.
      for (const cluster of clusters.values()) {
        cluster.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      }

      // Sort clusters by their earliest timestamp.
      const sortedClusters = Array.from(clusters.entries()).sort((a, b) => {
        const aFirst = a[1][0].timestamp;
        const bFirst = b[1][0].timestamp;
        return aFirst.localeCompare(bFirst);
      });

      // Sort no-GPS items chronologically too.
      withoutGps.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      // Build ordered list and group metadata.
      orderedIds = [];
      groups = [];
      let idx = 0;

      for (const [key, cluster] of sortedClusters) {
        const [latStr, lngStr] = key.split(",");
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);
        const latDir = lat >= 0 ? "N" : "S";
        const lngDir = lng >= 0 ? "E" : "W";

        groups.push({
          label: `${Math.abs(lat).toFixed(2)}°${latDir}, ${Math.abs(lng).toFixed(2)}°${lngDir}`,
          latitude: lat,
          longitude: lng,
          startIndex: idx,
          count: cluster.length,
        });

        for (const item of cluster) {
          orderedIds.push(item.id);
          idx++;
        }
      }

      if (withoutGps.length > 0) {
        groups.push({
          label: "No location data",
          latitude: null,
          longitude: null,
          startIndex: idx,
          count: withoutGps.length,
        });
        for (const item of withoutGps) {
          orderedIds.push(item.id);
          idx++;
        }
      }
    }

    // Persist the new order atomically.
    await prisma.$transaction(
      orderedIds.map((id, idx) =>
        prisma.viontoAlbumItem.update({
          where: { id },
          data: { orderIndex: idx },
        })
      )
    );

    return NextResponse.json({
      ok: true,
      orderedItemIds: orderedIds,
      ...(groups && { groups }),
    });
  } catch (error) {
    return serverError("projects/[projectId]/albums/[albumId]/items/sort POST", error);
  }
}
