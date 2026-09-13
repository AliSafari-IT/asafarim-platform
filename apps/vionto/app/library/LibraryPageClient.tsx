"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslation } from "@asafarim/shared-i18n";
import { Clapperboard, Clock, FolderOpen, HardDrive, Search, Video } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────

interface LibraryExport {
  id: string;
  projectId: string;
  versionId: string | null;
  projectTitle: string;
  versionName: string | null;
  filename: string | null;
  mode: string | null;
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

interface Filters {
  search: string;
  projectId: string;
  mode: string;
  aspectRatio: string;
  createdFrom: string;
  createdTo: string;
}

const MODES = ["cinematic", "slideshow", "social"];
const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3"];

function filtersFromParams(params: URLSearchParams): Filters {
  return {
    search: params.get("search") ?? "",
    projectId: params.get("projectId") ?? "",
    mode: params.get("mode") ?? "",
    aspectRatio: params.get("aspectRatio") ?? "",
    createdFrom: params.get("createdFrom") ?? "",
    createdTo: params.get("createdTo") ?? "",
  };
}

function filtersToQuery(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.projectId) params.set("projectId", filters.projectId);
  if (filters.mode) params.set("mode", filters.mode);
  if (filters.aspectRatio) params.set("aspectRatio", filters.aspectRatio);
  if (filters.createdFrom) params.set("createdFrom", filters.createdFrom);
  if (filters.createdTo) params.set("createdTo", filters.createdTo);
  return params.toString();
}

function hasActiveFilters(filters: Filters): boolean {
  return Object.values(filters).some(Boolean);
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

// ─── Component ──────────────────────────────────────────────────────

export function LibraryPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const { t } = useTranslation();

  const urlFilters = useMemo(() => filtersFromParams(searchParams), [searchParams]);
  const [searchInput, setSearchInput] = useState(urlFilters.search);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [videos, setVideos] = useState<LibraryExport[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);

  // Keep the search box in sync when filters change via URL (back/forward, clear).
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

  // Project options for the filter dropdown — fetched once, authenticated only.
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

  const queryString = useMemo(() => filtersToQuery(urlFilters), [urlFilters]);

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

      {/* ─── Filters ──────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-end gap-3">
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
          onChange={(value) => updateFilters({ projectId: value })}
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

      {stats ? (
        <p className="mb-4 text-xs text-[var(--color-text-muted)]">
          {t("vionto.libraryPage.showingCount", { shown: videos.length, total: stats.totalVideos })}
        </p>
      ) : null}

      {/* ─── Grid ─────────────────────────────────────────────────── */}
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {videos.map((video) => (
              <VideoCard key={video.id} video={video} openProjectLabel={t("vionto.libraryPage.openProject")} />
            ))}
          </div>

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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-[var(--color-text-muted)]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none ring-[var(--color-primary)] focus:ring-2"
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

function VideoCard({ video, openProjectLabel }: { video: LibraryExport; openProjectLabel: string }) {
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
