import type { Prisma } from "@asafarim/db";

/**
 * Filter-parsing and where-building shared between GET /api/exports/library
 * (paginated list) and GET /api/exports/library/stats (aggregate) — the two
 * routes must agree on exactly what "matching the current filters" means, or
 * the stats strip and the list it describes would silently disagree.
 */

export const MODES = new Set(["cinematic", "slideshow", "social"]);
export const ASPECT_RATIOS = new Set(["16:9", "9:16", "1:1", "4:3"]);

export interface LibraryFilters {
  mode: string | null;
  aspectRatio: string | null;
  projectId: string | null;
  createdFrom: Date | undefined;
  createdTo: Date | undefined;
  search: string;
}

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function parseLibraryFilters(searchParams: URLSearchParams): LibraryFilters {
  return {
    mode: searchParams.get("mode"),
    aspectRatio: searchParams.get("aspectRatio"),
    projectId: searchParams.get("projectId"),
    createdFrom: parseDate(searchParams.get("createdFrom")),
    createdTo: parseDate(searchParams.get("createdTo")),
    search: searchParams.get("search")?.trim() ?? "",
  };
}

export function buildLibraryWhere(
  filters: LibraryFilters,
  userId: string
): Prisma.ViontoExportWhereInput {
  return {
    userId,
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.mode && MODES.has(filters.mode) ? { userMode: filters.mode } : {}),
    ...(filters.aspectRatio && ASPECT_RATIOS.has(filters.aspectRatio)
      ? { aspectRatio: filters.aspectRatio }
      : {}),
    ...(filters.createdFrom || filters.createdTo
      ? {
          createdAt: {
            ...(filters.createdFrom ? { gte: filters.createdFrom } : {}),
            ...(filters.createdTo ? { lte: filters.createdTo } : {}),
          },
        }
      : {}),
    ...(filters.search
      ? {
          OR: [
            { previewTitle: { contains: filters.search, mode: "insensitive" as const } },
            { filename: { contains: filters.search, mode: "insensitive" as const } },
            { storyKeywords: { array_contains: [filters.search] } },
          ],
        }
      : {}),
    renderJob: { is: { state: "completed" } },
  };
}
