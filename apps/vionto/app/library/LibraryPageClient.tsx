"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslation } from "@asafarim/shared-i18n";
import {
  Clapperboard,
  Clock,
  Download,
  FolderOpen,
  HardDrive,
  LayoutGrid,
  List,
  Search,
  SlidersHorizontal,
  Trash2,
  Video,
} from "lucide-react";
import { VISUAL_STYLE_OPTIONS } from "@/lib/visual-styles";
import { ConfirmDialog } from "@/components/ConfirmDialog";

// ─── Types ──────────────────────────────────────────────────────────

interface LibraryExport {
  id: string;
  projectId: string;
  versionId: string | null;
  projectTitle: string;
  versionName: string | null;
  filename: string | null;
  mode: string | null;
  storyMode: string | null;
  emotionalTone: string | null;
  visualStyle: string | null;
  renderMode: string | null;
  aspectRatio: string | null;
  previewTitle: string | null;
  format: string;
  resolution: string | null;
  durationSeconds: number | null;
  fileSizeBytes: number | null;
  createdAt: string;
  previewUrl: string | null;
}

interface LibraryStats {
  totalVideos: number;
  totalDurationSeconds: number;
  totalOutputBytes: number;
  uniqueProjectCount: number;
}

interface ProjectOption {
  id: string;
  title: string;
}

interface VersionOption {
  id: string;
  name: string;
}

type ViewMode = "grid" | "list";

interface Filters {
  search: string;
  projectId: string;
  versionId: string;
  mode: string;
  aspectRatio: string;
  resolution: string;
  format: string;
  visualStyle: string;
  storyMode: string;
  emotionalTone: string;
  renderMode: string;
  durationMin: string;
  durationMax: string;
  createdFrom: string;
  createdTo: string;
  sort: string;
  view: ViewMode;
}

const MODES = ["cinematic", "slideshow", "social"];
const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3"];
const RESOLUTIONS = ["720p", "1080p", "4k"];
const FORMATS = ["mp4", "mov", "webm"];
const STORY_MODES = ["memory_film", "travel_recap", "family_archive", "event_recap", "social_reel", "documentary"];
const EMOTIONAL_TONES = ["nostalgic", "joyful", "calm", "epic", "funny", "romantic", "reflective"];
const SORT_OPTIONS = ["newest", "oldest", "duration_desc", "duration_asc", "size_desc", "size_asc"] as const;

function filtersFromParams(params: URLSearchParams): Filters {
  return {
    search: params.get("search") ?? "",
    projectId: params.get("projectId") ?? "",
    versionId: params.get("versionId") ?? "",
    mode: params.get("mode") ?? "",
    aspectRatio: params.get("aspectRatio") ?? "",
    resolution: params.get("resolution") ?? "",
    format: params.get("format") ?? "",
    visualStyle: params.get("visualStyle") ?? "",
    storyMode: params.get("storyMode") ?? "",
    emotionalTone: params.get("emotionalTone") ?? "",
    renderMode: params.get("renderMode") ?? "",
    durationMin: params.get("durationMin") ?? "",
    durationMax: params.get("durationMax") ?? "",
    createdFrom: params.get("createdFrom") ?? "",
    createdTo: params.get("createdTo") ?? "",
    sort: params.get("sort") ?? "newest",
    view: params.get("view") === "list" ? "list" : "grid",
  };
}

function filtersToQuery(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.projectId) params.set("projectId", filters.projectId);
  if (filters.versionId) params.set("versionId", filters.versionId);
  if (filters.mode) params.set("mode", filters.mode);
  if (filters.aspectRatio) params.set("aspectRatio", filters.aspectRatio);
  if (filters.resolution) params.set("resolution", filters.resolution);
  if (filters.format) params.set("format", filters.format);
  if (filters.visualStyle) params.set("visualStyle", filters.visualStyle);
  if (filters.storyMode) params.set("storyMode", filters.storyMode);
  if (filters.emotionalTone) params.set("emotionalTone", filters.emotionalTone);
  if (filters.renderMode) params.set("renderMode", filters.renderMode);
  if (filters.durationMin) params.set("durationMin", filters.durationMin);
  if (filters.durationMax) params.set("durationMax", filters.durationMax);
  if (filters.createdFrom) params.set("createdFrom", filters.createdFrom);
  if (filters.createdTo) params.set("createdTo", filters.createdTo);
  if (filters.sort && filters.sort !== "newest") params.set("sort", filters.sort);
  if (filters.view === "list") params.set("view", "list");
  return params.toString();
}

/** Query string sent to the API — excludes `view`, which is UI-only and unknown to the backend. */
function filtersToApiQuery(filters: Filters): string {
  const params = new URLSearchParams(filtersToQuery(filters));
  params.delete("view");
  return params.toString();
}

function hasActiveFilters(filters: Filters): boolean {
  return Object.entries(filters).some(([key, value]) => {
    if (key === "view") return false;
    if (key === "sort") return value !== "newest";
    return Boolean(value);
  });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatDurationLong(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

async function handleDownload(exportId: string) {
  try {
    const res = await fetch(`/api/exports/${exportId}/download`);
    if (!res.ok) return;
    const json = await res.json();
    if (json?.downloadUrl) window.open(json.downloadUrl, "_blank", "noopener,noreferrer");
  } catch {
    // Best-effort — a failed download request just does nothing rather than throwing in the UI.
  }
}

// ─── Component ──────────────────────────────────────────────────────

export function LibraryPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const { t } = useTranslation();

  const urlFilters = useMemo(() => filtersFromParams(searchParams), [searchParams]);
  const [searchInput, setSearchInput] = useState(urlFilters.search);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [videos, setVideos] = useState<LibraryExport[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [versions, setVersions] = useState<VersionOption[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<LibraryExport | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setSearchInput(urlFilters.search);
  }, [urlFilters.search]);

  const updateFilters = useCallback(
    (next: Partial<Filters>) => {
      const merged = { ...urlFilters, ...next };
      const qs = filtersToQuery(merged);
      router.replace(qs ? `/library?${qs}` : "/library", { scroll: false });
    },
    [router, urlFilters]
  );

  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => updateFilters({ search: value }), 400);
  }

  // Project options — fetched once, authenticated only.
  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/projects?pageSize=100&sortBy=title&sortOrder=asc")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.data) {
          setProjects(json.data.map((p: { id: string; title: string }) => ({ id: p.id, title: p.title })));
        }
      })
      .catch(() => {});
  }, [status]);

  // Version options — dependent on the selected project, per the issue's
  // "populate it after selecting a project" guidance. Reuses the same
  // endpoint the /create workspace already uses for its version list.
  useEffect(() => {
    if (status !== "authenticated" || !urlFilters.projectId) {
      setVersions([]);
      return;
    }
    fetch(`/api/projects/${urlFilters.projectId}/versions`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.data) {
          setVersions(json.data.map((v: { id: string; name: string }) => ({ id: v.id, name: v.name })));
        }
      })
      .catch(() => {});
  }, [status, urlFilters.projectId]);

  const queryString = useMemo(() => filtersToApiQuery(urlFilters), [urlFilters]);

  // List + stats — refetch from the top whenever filters change.
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    setLoading(true);

    Promise.all([
      fetch(`/api/exports/library${queryString ? `?${queryString}` : ""}`).then((res) =>
        res.ok ? res.json() : null
      ),
      fetch(`/api/exports/library/stats${queryString ? `?${queryString}` : ""}`).then((res) =>
        res.ok ? res.json() : null
      ),
    ])
      .then(([listJson, statsJson]) => {
        if (cancelled) return;
        setVideos(listJson?.data ?? []);
        setNextCursor(listJson?.nextCursor ?? null);
        setStats(statsJson ?? null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [status, queryString]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams(queryString);
      params.set("cursor", nextCursor);
      const res = await fetch(`/api/exports/library?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setVideos((prev) => [...prev, ...(json.data ?? [])]);
        setNextCursor(json.nextCursor ?? null);
      }
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/exports/${deleteTarget.id}`, { method: "DELETE" });
      if (res.ok) {
        const removed = deleteTarget;
        setVideos((prev) => prev.filter((v) => v.id !== removed.id));
        setStats((prev) =>
          prev
            ? {
                totalVideos: Math.max(0, prev.totalVideos - 1),
                totalDurationSeconds: Math.max(0, prev.totalDurationSeconds - (removed.durationSeconds ?? 0)),
                totalOutputBytes: Math.max(0, prev.totalOutputBytes - (removed.fileSizeBytes ?? 0)),
                // The removed video may or may not have been its project's
                // last one — an exact recount would need another request,
                // so this stays approximate until the next filter change
                // refetches for real, matching how "showing N of M" already
                // only ever reflects the last fetch.
                uniqueProjectCount: prev.uniqueProjectCount,
              }
            : prev
        );
        setDeleteTarget(null);
      }
    } finally {
      setDeleting(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-panel)] px-8 py-16 text-center">
        <p className="mb-4 text-[var(--color-text-muted)]">{t("vionto.libraryPage.signInPrompt")}</p>
        <a
          href="/api/auth/signin"
          className="inline-block rounded-xl bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          {t("vionto.libraryPage.signIn")}
        </a>
      </div>
    );
  }

  const filtersActive = hasActiveFilters(urlFilters);
  const isEmpty = !loading && videos.length === 0;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">{t("vionto.libraryPage.title")}</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{t("vionto.libraryPage.description")}</p>
        </div>
        <a
          href="/create"
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          <Clapperboard className="h-4 w-4" />
          {t("vionto.libraryPage.createVideo")}
        </a>
      </div>

      {/* ─── Stats strip ─────────────────────────────────────────── */}
      {stats ? (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={Video} label={t("vionto.libraryPage.statTotalVideos")} value={stats.totalVideos} />
          <StatCard
            icon={Clock}
            label={t("vionto.libraryPage.statTotalDuration")}
            value={formatDurationLong(stats.totalDurationSeconds)}
          />
          <StatCard
            icon={HardDrive}
            label={t("vionto.libraryPage.statTotalStorage")}
            value={formatBytes(stats.totalOutputBytes)}
          />
          <StatCard icon={FolderOpen} label={t("vionto.libraryPage.statProjects")} value={stats.uniqueProjectCount} />
        </div>
      ) : null}

      {/* ─── Primary filters ─────────────────────────────────────── */}
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={t("vionto.libraryPage.searchPlaceholder")}
            className="w-full rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] py-2.5 pl-9 pr-4 text-sm outline-none ring-[var(--color-primary)] focus:ring-2"
          />
        </div>

        <FilterSelect
          label={t("vionto.libraryPage.filterProject")}
          value={urlFilters.projectId}
          onChange={(value) => updateFilters({ projectId: value, versionId: "" })}
          options={[
            { value: "", label: t("vionto.libraryPage.filterProjectAll") },
            ...projects.map((p) => ({ value: p.id, label: p.title })),
          ]}
        />

        <FilterSelect
          label={t("vionto.libraryPage.filterMode")}
          value={urlFilters.mode}
          onChange={(value) => updateFilters({ mode: value })}
          options={[
            { value: "", label: t("vionto.libraryPage.filterModeAll") },
            ...MODES.map((m) => ({ value: m, label: m })),
          ]}
        />

        <FilterSelect
          label={t("vionto.libraryPage.filterAspect")}
          value={urlFilters.aspectRatio}
          onChange={(value) => updateFilters({ aspectRatio: value })}
          options={[
            { value: "", label: t("vionto.libraryPage.filterAspectAll") },
            ...ASPECT_RATIOS.map((a) => ({ value: a, label: a })),
          ]}
        />

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--color-text-muted)]">{t("vionto.libraryPage.filterFrom")}</span>
          <input
            type="date"
            value={urlFilters.createdFrom}
            onChange={(e) => updateFilters({ createdFrom: e.target.value })}
            className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none ring-[var(--color-primary)] focus:ring-2"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--color-text-muted)]">{t("vionto.libraryPage.filterTo")}</span>
          <input
            type="date"
            value={urlFilters.createdTo}
            onChange={(e) => updateFilters({ createdTo: e.target.value })}
            className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none ring-[var(--color-primary)] focus:ring-2"
          />
        </label>

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition ${
            showAdvanced
              ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
              : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-accent)]"
          }`}
        >
          <SlidersHorizontal size={14} />
          {t("vionto.libraryPage.advancedFilters")}
        </button>

        {filtersActive ? (
          <button
            type="button"
            onClick={() => {
              setSearchInput("");
              router.replace("/library", { scroll: false });
            }}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-text)] transition hover:border-[var(--color-accent)]"
          >
            {t("vionto.libraryPage.clearFilters")}
          </button>
        ) : null}
      </div>

      {/* ─── Advanced filters (collapsible) ──────────────────────── */}
      {showAdvanced ? (
        <div className="mb-3 flex flex-wrap items-end gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-3">
          <FilterSelect
            label={t("vionto.libraryPage.filterVersion")}
            value={urlFilters.versionId}
            onChange={(value) => updateFilters({ versionId: value })}
            options={[
              { value: "", label: t("vionto.libraryPage.filterVersionAll") },
              ...versions.map((v) => ({ value: v.id, label: v.name })),
            ]}
            disabled={!urlFilters.projectId}
          />
          <FilterSelect
            label={t("vionto.libraryPage.filterResolution")}
            value={urlFilters.resolution}
            onChange={(value) => updateFilters({ resolution: value })}
            options={[
              { value: "", label: t("vionto.libraryPage.filterResolutionAll") },
              ...RESOLUTIONS.map((r) => ({ value: r, label: r })),
            ]}
          />
          <FilterSelect
            label={t("vionto.libraryPage.filterFormat")}
            value={urlFilters.format}
            onChange={(value) => updateFilters({ format: value })}
            options={[
              { value: "", label: t("vionto.libraryPage.filterFormatAll") },
              ...FORMATS.map((f) => ({ value: f, label: f.toUpperCase() })),
            ]}
          />
          <FilterSelect
            label={t("vionto.libraryPage.filterVisualStyle")}
            value={urlFilters.visualStyle}
            onChange={(value) => updateFilters({ visualStyle: value })}
            options={[
              { value: "", label: t("vionto.libraryPage.filterVisualStyleAll") },
              ...VISUAL_STYLE_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) })),
            ]}
          />
          <FilterSelect
            label={t("vionto.libraryPage.filterStoryMode")}
            value={urlFilters.storyMode}
            onChange={(value) => updateFilters({ storyMode: value })}
            options={[
              { value: "", label: t("vionto.libraryPage.filterStoryModeAll") },
              ...STORY_MODES.map((m) => ({ value: m, label: t(`vionto.storyMode.${m}`) })),
            ]}
          />
          <FilterSelect
            label={t("vionto.libraryPage.filterEmotionalTone")}
            value={urlFilters.emotionalTone}
            onChange={(value) => updateFilters({ emotionalTone: value })}
            options={[
              { value: "", label: t("vionto.libraryPage.filterEmotionalToneAll") },
              ...EMOTIONAL_TONES.map((tone) => ({ value: tone, label: t(`vionto.emotionalTone.${tone}`) })),
            ]}
          />
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">
              {t("vionto.libraryPage.filterDurationMin")}
            </span>
            <input
              type="number"
              min={0}
              value={urlFilters.durationMin}
              onChange={(e) => updateFilters({ durationMin: e.target.value })}
              className="w-24 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none ring-[var(--color-primary)] focus:ring-2"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">
              {t("vionto.libraryPage.filterDurationMax")}
            </span>
            <input
              type="number"
              min={0}
              value={urlFilters.durationMax}
              onChange={(e) => updateFilters({ durationMax: e.target.value })}
              className="w-24 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none ring-[var(--color-primary)] focus:ring-2"
            />
          </label>
        </div>
      ) : null}

      {/* ─── Sort + view toggle ──────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <FilterSelect
          label={t("vionto.libraryPage.sortLabel")}
          value={urlFilters.sort}
          onChange={(value) => updateFilters({ sort: value })}
          options={SORT_OPTIONS.map((s) => ({ value: s, label: t(`vionto.libraryPage.sort.${s}`) }))}
        />
        <div className="flex items-center gap-1 rounded-xl border border-[var(--color-border)] p-1">
          <button
            type="button"
            onClick={() => updateFilters({ view: "grid" })}
            aria-pressed={urlFilters.view === "grid"}
            title={t("vionto.libraryPage.viewGrid")}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
              urlFilters.view === "grid"
                ? "bg-[var(--color-primary)] text-white"
                : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-soft)]"
            }`}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            type="button"
            onClick={() => updateFilters({ view: "list" })}
            aria-pressed={urlFilters.view === "list"}
            title={t("vionto.libraryPage.viewList")}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
              urlFilters.view === "list"
                ? "bg-[var(--color-primary)] text-white"
                : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-soft)]"
            }`}
          >
            <List size={16} />
          </button>
        </div>
      </div>

      {stats ? (
        <p className="mb-4 text-xs text-[var(--color-text-muted)]">
          {t("vionto.libraryPage.showingCount", { shown: videos.length, total: stats.totalVideos })}
        </p>
      ) : null}

      {/* ─── Results ──────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
        </div>
      ) : isEmpty ? (
        <div className="rounded-2xl border-2 border-dashed border-[var(--color-border)] px-8 py-16 text-center">
          <Video className="mx-auto mb-4 h-12 w-12 text-[var(--color-text-muted)] opacity-40" />
          <h2 className="text-lg font-semibold text-[var(--color-text)]">
            {filtersActive ? t("vionto.libraryPage.emptyFilteredTitle") : t("vionto.libraryPage.emptyTitle")}
          </h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            {filtersActive ? t("vionto.libraryPage.emptyFilteredDescription") : t("vionto.libraryPage.emptyDescription")}
          </p>
        </div>
      ) : (
        <>
          {urlFilters.view === "grid" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {videos.map((video) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  openProjectLabel={t("vionto.libraryPage.openProject")}
                  downloadLabel={t("vionto.libraryPage.download")}
                  deleteLabel={t("vionto.libraryPage.delete")}
                  onDelete={() => setDeleteTarget(video)}
                />
              ))}
            </div>
          ) : (
            <VideoTable
              videos={videos}
              openProjectLabel={t("vionto.libraryPage.openProject")}
              columns={{
                title: t("vionto.libraryPage.columnTitle"),
                project: t("vionto.libraryPage.columnProject"),
                version: t("vionto.libraryPage.columnVersion"),
                generated: t("vionto.libraryPage.columnGenerated"),
                duration: t("vionto.libraryPage.columnDuration"),
                mode: t("vionto.libraryPage.columnMode"),
                aspect: t("vionto.libraryPage.columnAspect"),
                resolution: t("vionto.libraryPage.columnResolution"),
                size: t("vionto.libraryPage.columnSize"),
                actions: t("vionto.libraryPage.columnActions"),
              }}
              downloadLabel={t("vionto.libraryPage.download")}
              deleteLabel={t("vionto.libraryPage.delete")}
              onDelete={(video) => setDeleteTarget(video)}
            />
          )}

          {nextCursor ? (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-5 py-2.5 text-sm font-medium text-[var(--color-text)] transition hover:border-[var(--color-accent)] disabled:opacity-50"
              >
                {loadingMore ? t("vionto.libraryPage.loading") : t("vionto.libraryPage.loadMore")}
              </button>
            </div>
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t("vionto.libraryPage.deleteConfirmTitle")}
        message={t("vionto.libraryPage.deleteConfirmMessage", {
          title: deleteTarget?.previewTitle ?? deleteTarget?.filename ?? "",
        })}
        confirmLabel={deleting ? t("vionto.libraryPage.deleting") : t("vionto.libraryPage.delete")}
        cancelLabel={t("vionto.libraryPage.cancel")}
        tone="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 text-center">
      <Icon size={18} className="mx-auto mb-1 text-[var(--color-accent)] opacity-70" />
      <p className="text-lg font-bold text-[var(--color-text)]">{value}</p>
      <p className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide">{label}</p>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-[var(--color-text-muted)]">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none ring-[var(--color-primary)] focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function VideoCard({
  video,
  openProjectLabel,
  downloadLabel,
  deleteLabel,
  onDelete,
}: {
  video: LibraryExport;
  openProjectLabel: string;
  downloadLabel: string;
  deleteLabel: string;
  onDelete: () => void;
}) {
  return (
    <div className="group overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] transition hover:border-[var(--color-accent)]">
      <div className="relative aspect-video w-full overflow-hidden bg-[var(--color-surface-soft)]">
        {video.previewUrl ? (
          <video
            src={video.previewUrl}
            preload="none"
            muted
            playsInline
            className="h-full w-full object-cover"
            onMouseEnter={(e) => (e.target as HTMLVideoElement).play().catch(() => {})}
            onMouseLeave={(e) => {
              (e.target as HTMLVideoElement).pause();
              (e.target as HTMLVideoElement).currentTime = 0;
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Video size={28} className="text-[var(--color-text-muted)] opacity-30" />
          </div>
        )}
        {video.durationSeconds ? (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {formatDuration(video.durationSeconds)}
          </span>
        ) : null}
        <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition group-hover:opacity-100">
          <button
            type="button"
            onClick={() => handleDownload(video.id)}
            title={downloadLabel}
            aria-label={downloadLabel}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
          >
            <Download size={13} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title={deleteLabel}
            aria-label={deleteLabel}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-red-500/90"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <div className="p-3">
        <p className="truncate text-sm font-medium text-[var(--color-text)]">
          {video.previewTitle ?? video.filename ?? "Untitled"}
        </p>
        <a
          href={`/create?projectId=${video.projectId}`}
          title={openProjectLabel}
          className="mt-0.5 block truncate text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
        >
          {video.projectTitle}
          {video.versionName ? ` / ${video.versionName}` : ""}
        </a>
        <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
          {video.resolution ? <span>{video.resolution}</span> : null}
          {video.aspectRatio ? <span>{video.aspectRatio}</span> : null}
          {video.fileSizeBytes ? <span>{formatBytes(video.fileSizeBytes)}</span> : null}
          <span className="ml-auto flex items-center gap-0.5">
            <Clock size={10} /> {timeAgo(video.createdAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

function VideoTable({
  videos,
  openProjectLabel,
  columns,
  downloadLabel,
  deleteLabel,
  onDelete,
}: {
  videos: LibraryExport[];
  openProjectLabel: string;
  columns: Record<
    "title" | "project" | "version" | "generated" | "duration" | "mode" | "aspect" | "resolution" | "size" | "actions",
    string
  >;
  downloadLabel: string;
  deleteLabel: string;
  onDelete: (video: LibraryExport) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
      <table className="w-full min-w-[52rem] text-left text-sm">
        <thead className="bg-[var(--color-surface-soft)] text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">
          <tr>
            <th className="px-3 py-2 font-medium">{columns.title}</th>
            <th className="px-3 py-2 font-medium">{columns.project}</th>
            <th className="px-3 py-2 font-medium">{columns.version}</th>
            <th className="px-3 py-2 font-medium">{columns.generated}</th>
            <th className="px-3 py-2 font-medium">{columns.duration}</th>
            <th className="px-3 py-2 font-medium">{columns.mode}</th>
            <th className="px-3 py-2 font-medium">{columns.aspect}</th>
            <th className="px-3 py-2 font-medium">{columns.resolution}</th>
            <th className="px-3 py-2 font-medium">{columns.size}</th>
            <th className="px-3 py-2 font-medium text-right">{columns.actions}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {videos.map((video) => (
            <tr key={video.id} className="hover:bg-[var(--color-surface-soft)]">
              <td className="max-w-[16rem] truncate px-3 py-2 font-medium text-[var(--color-text)]">
                {video.previewTitle ?? video.filename ?? "Untitled"}
              </td>
              <td className="px-3 py-2 text-[var(--color-text-muted)]">
                <a
                  href={`/create?projectId=${video.projectId}`}
                  title={openProjectLabel}
                  className="hover:text-[var(--color-accent)]"
                >
                  {video.projectTitle}
                </a>
              </td>
              <td className="px-3 py-2 text-[var(--color-text-muted)]">{video.versionName ?? "—"}</td>
              <td className="px-3 py-2 text-[var(--color-text-muted)]">{timeAgo(video.createdAt)}</td>
              <td className="px-3 py-2 text-[var(--color-text-muted)]">
                {video.durationSeconds ? formatDuration(video.durationSeconds) : "—"}
              </td>
              <td className="px-3 py-2 text-[var(--color-text-muted)]">{video.mode ?? "—"}</td>
              <td className="px-3 py-2 text-[var(--color-text-muted)]">{video.aspectRatio ?? "—"}</td>
              <td className="px-3 py-2 text-[var(--color-text-muted)]">{video.resolution ?? "—"}</td>
              <td className="px-3 py-2 text-[var(--color-text-muted)]">
                {video.fileSizeBytes ? formatBytes(video.fileSizeBytes) : "—"}
              </td>
              <td className="px-3 py-2 text-right">
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => handleDownload(video.id)}
                    title={downloadLabel}
                    aria-label={downloadLabel}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface)] hover:text-[var(--color-accent)]"
                  >
                    <Download size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(video)}
                    title={deleteLabel}
                    aria-label={deleteLabel}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface)] hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
