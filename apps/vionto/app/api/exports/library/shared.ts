import type { Prisma } from "@asafarim/db";
import { VISUAL_STYLE_VALUES } from "@/lib/visual-styles";

/**
 * Filter-parsing and where-building shared between GET /api/exports/library
 * (paginated list) and GET /api/exports/library/stats (aggregate) — the two
 * routes must agree on exactly what "matching the current filters" means, or
 * the stats strip and the list it describes would silently disagree.
 */

export const MODES = new Set(["cinematic", "slideshow", "social"]);
export const ASPECT_RATIOS = new Set(["16:9", "9:16", "1:1", "4:3"]);
export const RESOLUTIONS = new Set(["720p", "1080p", "4k"]);
export const FORMATS = new Set(["mp4", "mov", "webm"]);
export const VISUAL_STYLES = new Set<string>(VISUAL_STYLE_VALUES);
// Not Prisma enums (see schema comments on ViontoExport) — these are the
// values the /create workflow's own STORY_MODE_OPTIONS / EMOTIONAL_TONE_OPTIONS
// (components/ViontoPage.tsx) actually write, duplicated here since there's
// no shared constants file for them yet (unlike lib/visual-styles.ts).
export const STORY_MODES = new Set([
  "memory_film",
  "travel_recap",
  "family_archive",
  "event_recap",
  "social_reel",
  "documentary",
]);
export const EMOTIONAL_TONES = new Set([
  "nostalgic",
  "joyful",
  "calm",
  "epic",
  "funny",
  "romantic",
  "reflective",
]);
// renderMode is sourced from the render manifest's own mode field
// (lib/server/render-manifest.ts), which is the same 3-value set as `mode`/
// `userMode` despite being a logically distinct column.
export const RENDER_MODES = MODES;

export const SORT_OPTIONS = [
  "newest",
  "oldest",
  "duration_desc",
  "duration_asc",
  "size_desc",
  "size_asc",
] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];
const SORT_OPTION_SET = new Set<string>(SORT_OPTIONS);

export interface LibraryFilters {
  mode: string | null;
  aspectRatio: string | null;
  projectId: string | null;
  versionId: string | null;
  resolution: string | null;
  format: string | null;
  visualStyle: string | null;
  storyMode: string | null;
  emotionalTone: string | null;
  renderMode: string | null;
  durationMin: number | undefined;
  durationMax: number | undefined;
  createdFrom: Date | undefined;
  createdTo: Date | undefined;
  search: string;
}

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parsePositiveInt(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function parseLibraryFilters(searchParams: URLSearchParams): LibraryFilters {
  return {
    mode: searchParams.get("mode"),
    aspectRatio: searchParams.get("aspectRatio"),
    projectId: searchParams.get("projectId"),
    versionId: searchParams.get("versionId"),
    resolution: searchParams.get("resolution"),
    format: searchParams.get("format"),
    visualStyle: searchParams.get("visualStyle"),
    storyMode: searchParams.get("storyMode"),
    emotionalTone: searchParams.get("emotionalTone"),
    renderMode: searchParams.get("renderMode"),
    durationMin: parsePositiveInt(searchParams.get("durationMin")),
    durationMax: parsePositiveInt(searchParams.get("durationMax")),
    createdFrom: parseDate(searchParams.get("createdFrom")),
    createdTo: parseDate(searchParams.get("createdTo")),
    search: searchParams.get("search")?.trim() ?? "",
  };
}

export function parseSort(value: string | null): SortOption {
  return value && SORT_OPTION_SET.has(value) ? (value as SortOption) : "newest";
}

/** Deterministic — every sort carries `id` as a tiebreaker so cursor pagination never skips or repeats a row when the primary field ties. */
export function buildLibraryOrderBy(
  sort: SortOption
): Prisma.ViontoExportOrderByWithRelationInput[] {
  switch (sort) {
    case "oldest":
      return [{ createdAt: "asc" }, { id: "asc" }];
    case "duration_desc":
      return [{ durationSeconds: "desc" }, { id: "asc" }];
    case "duration_asc":
      return [{ durationSeconds: "asc" }, { id: "asc" }];
    case "size_desc":
      return [{ fileSizeBytes: "desc" }, { id: "asc" }];
    case "size_asc":
      return [{ fileSizeBytes: "asc" }, { id: "asc" }];
    case "newest":
    default:
      return [{ createdAt: "desc" }, { id: "asc" }];
  }
}

export function buildLibraryWhere(
  filters: LibraryFilters,
  userId: string
): Prisma.ViontoExportWhereInput {
  const durationSeconds: { gte?: number; lte?: number } = {};
  if (filters.durationMin !== undefined) durationSeconds.gte = filters.durationMin;
  if (filters.durationMax !== undefined) durationSeconds.lte = filters.durationMax;

  return {
    userId,
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.versionId ? { versionId: filters.versionId } : {}),
    ...(filters.mode && MODES.has(filters.mode) ? { userMode: filters.mode } : {}),
    ...(filters.aspectRatio && ASPECT_RATIOS.has(filters.aspectRatio)
      ? { aspectRatio: filters.aspectRatio }
      : {}),
    ...(filters.resolution && RESOLUTIONS.has(filters.resolution)
      ? { resolution: filters.resolution }
      : {}),
    ...(filters.format && FORMATS.has(filters.format) ? { format: filters.format } : {}),
    ...(filters.visualStyle && VISUAL_STYLES.has(filters.visualStyle)
      ? { visualStyle: filters.visualStyle }
      : {}),
    ...(filters.storyMode && STORY_MODES.has(filters.storyMode)
      ? { storyMode: filters.storyMode }
      : {}),
    ...(filters.emotionalTone && EMOTIONAL_TONES.has(filters.emotionalTone)
      ? { emotionalTone: filters.emotionalTone }
      : {}),
    ...(filters.renderMode && RENDER_MODES.has(filters.renderMode)
      ? { renderMode: filters.renderMode }
      : {}),
    ...(Object.keys(durationSeconds).length > 0 ? { durationSeconds } : {}),
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
