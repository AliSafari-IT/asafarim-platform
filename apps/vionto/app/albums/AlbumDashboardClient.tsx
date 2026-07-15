"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ArrowRight,
  Clapperboard,
  Clock,
  Download,
  Film,
  FolderOpen,
  HardDrive,
  Image,
  Layers,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Video,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────

type DashboardAlbum = {
  id: string;
  projectId: string;
  projectTitle: string;
  name: string;
  isBase: boolean;
  lifecycleStage: string | null;
  photoCount: number;
  videoVersionCount: number;
  exportCount: number;
  coverUrl: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  location: string | null;
  occasion: string | null;
  mood: string | null;
  createdAt: string;
  updatedAt: string;
};

type InProgressRender = {
  id: string;
  projectId: string;
  versionId: string | null;
  projectTitle: string;
  versionName: string | null;
  state: string;
  progressPercent: number | null;
  errorSummary: string | null;
  createdAt: string;
};

type RecentExport = {
  id: string;
  projectId: string;
  versionId: string | null;
  projectTitle: string;
  versionName: string | null;
  filename: string | null;
  format: string | null;
  resolution: string | null;
  durationSeconds: number | null;
  fileSizeBytes: number | null;
  mode: string | null;
  aspectRatio: string | null;
  visualStyle: string | null;
  previewTitle: string | null;
  previewSubtitle: string | null;
  createdAt: string;
  previewUrl: string | null;
};

type DashboardStats = {
  projectCount: number;
  albumCount: number;
  versionCount: number;
  exportCount: number;
  activeRenderCount: number;
  storageUsedBytes: number;
  totalAssets: number;
};

type DashboardData = {
  albums: DashboardAlbum[];
  inProgressRenders: InProgressRender[];
  recentExports: RecentExport[];
  stats: DashboardStats;
};

// ─── Helpers ────────────────────────────────────────────────────────

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

const LIFECYCLE_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "text-gray-500 bg-gray-100 dark:bg-gray-800" },
  photos_uploaded: { label: "Photos ready", color: "text-blue-600 bg-blue-50 dark:bg-blue-950" },
  story_generated: { label: "Story ready", color: "text-purple-600 bg-purple-50 dark:bg-purple-950" },
  audio_ready: { label: "Audio ready", color: "text-amber-600 bg-amber-50 dark:bg-amber-950" },
  video_rendered: { label: "Rendered", color: "text-green-600 bg-green-50 dark:bg-green-950" },
  published_exported: { label: "Published", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950" },
};

// ─── Component ──────────────────────────────────────────────────────

export function AlbumDashboardClient() {
  const { status } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    loadDashboard();
  }, [status]);

  async function loadDashboard() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard");
      if (!res.ok) throw new Error("Failed to load dashboard");
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }

  if (status === "loading" || isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-accent)]" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-8 py-16 text-center">
        <p className="mb-4 text-[var(--color-text-muted)]">Sign in to view your album dashboard.</p>
        <a
          href="/api/auth/signin"
          className="inline-block rounded-xl bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          Sign in
        </a>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-8 text-center dark:border-red-800 dark:bg-red-950">
        <p className="text-red-600 dark:text-red-400">{error}</p>
        <button
          onClick={loadDashboard}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { albums, inProgressRenders, recentExports, stats } = data;
  const isEmpty = stats.projectCount === 0;

  return (
    <div className="space-y-8">
      {/* ─── Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Album Dashboard</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Overview of your albums, renders, and videos
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/create"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            <Plus size={16} /> New Video
          </Link>
          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-text)] transition hover:border-[var(--color-accent)]"
          >
            <FolderOpen size={16} /> Projects
          </Link>
        </div>
      </div>

      {/* ─── Stats Cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard icon={FolderOpen} label="Projects" value={stats.projectCount} />
        <StatCard icon={Layers} label="Albums" value={stats.albumCount} />
        <StatCard icon={Image} label="Photos" value={stats.totalAssets} />
        <StatCard icon={Film} label="Versions" value={stats.versionCount} />
        <StatCard icon={Video} label="Exports" value={stats.exportCount} />
        <StatCard icon={HardDrive} label="Storage" value={formatBytes(stats.storageUsedBytes)} />
      </div>

      {/* ─── Empty State ─────────────────────────────────────────── */}
      {isEmpty && (
        <div className="rounded-2xl border-2 border-dashed border-[var(--color-border)] px-8 py-16 text-center">
          <Clapperboard className="mx-auto mb-4 h-12 w-12 text-[var(--color-text-muted)] opacity-40" />
          <h2 className="text-lg font-semibold text-[var(--color-text)]">No albums yet</h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Create your first project, upload photos, and turn them into a video.
          </p>
          <Link
            href="/create"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            <Plus size={16} /> Create Your First Video
          </Link>
        </div>
      )}

      {/* ─── In-Progress Renders ─────────────────────────────────── */}
      {inProgressRenders.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
            <Loader2 size={16} className="animate-spin text-[var(--color-accent)]" />
            In-Progress Renders ({inProgressRenders.length})
          </h2>
          <div className="space-y-2">
            {inProgressRenders.map((job) => (
              <div
                key={job.id}
                className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--color-text)]">
                    {job.projectTitle}
                    {job.versionName && (
                      <span className="ml-1.5 text-[var(--color-text-muted)]">/ {job.versionName}</span>
                    )}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {job.state === "processing" ? "Rendering..." : "Queued"} · Started {timeAgo(job.createdAt)}
                  </p>
                </div>
                {job.progressPercent != null && (
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--color-border)]">
                      <div
                        className="h-full rounded-full bg-[var(--color-accent)] transition-all"
                        style={{ width: `${Math.min(job.progressPercent, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-[var(--color-text-muted)]">
                      {Math.round(job.progressPercent)}%
                    </span>
                  </div>
                )}
                <Link
                  href={`/create?projectId=${job.projectId}`}
                  className="shrink-0 text-xs font-medium text-[var(--color-accent)] hover:underline"
                >
                  View
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─── Recent Albums ───────────────────────────────────────── */}
      {albums.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--color-text)]">
              Recent Albums ({albums.length})
            </h2>
            <Link
              href="/projects"
              className="text-xs font-medium text-[var(--color-accent)] hover:underline flex items-center gap-1"
            >
              All projects <ArrowRight size={12} />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {albums.map((album) => {
              const lifecycle = album.lifecycleStage
                ? LIFECYCLE_LABELS[album.lifecycleStage] ?? LIFECYCLE_LABELS.draft
                : LIFECYCLE_LABELS.draft;

              return (
                <Link
                  key={album.id}
                  href={`/create?projectId=${album.projectId}`}
                  className="group flex flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] transition hover:border-[var(--color-accent)] hover:shadow-sm"
                >
                  {/* Cover image or placeholder */}
                  <div className="relative aspect-[16/10] w-full bg-gradient-to-br from-[var(--color-surface-soft)] to-[var(--color-border)] overflow-hidden">
                    {album.coverUrl ? (
                      <img
                        src={album.coverUrl}
                        alt=""
                        className="h-full w-full object-cover transition group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Image size={32} className="text-[var(--color-text-muted)] opacity-30" />
                      </div>
                    )}
                    {/* Lifecycle badge */}
                    <span className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${lifecycle.color}`}>
                      {lifecycle.label}
                    </span>
                  </div>
                  {/* Info */}
                  <div className="flex flex-1 flex-col p-3">
                    <p className="truncate text-sm font-semibold text-[var(--color-text)]">
                      {album.isBase ? album.projectTitle : album.name}
                    </p>
                    {!album.isBase && (
                      <p className="truncate text-xs text-[var(--color-text-muted)]">{album.projectTitle}</p>
                    )}
                    <div className="mt-auto flex items-center gap-3 pt-2 text-[11px] text-[var(--color-text-muted)]">
                      <span className="flex items-center gap-0.5">
                        <Image size={11} /> {album.photoCount}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <Film size={11} /> {album.videoVersionCount}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <Download size={11} /> {album.exportCount}
                      </span>
                      {album.location && (
                        <span className="flex items-center gap-0.5 truncate">
                          <MapPin size={11} /> {album.location}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ─── Completed Videos ────────────────────────────────────── */}
      {recentExports.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">
            Recent Videos ({recentExports.length})
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {recentExports.map((exp) => (
              <div
                key={exp.id}
                className="group overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] transition hover:border-[var(--color-accent)]"
              >
                {/* Preview */}
                <div className="relative aspect-video w-full bg-[var(--color-surface-soft)] overflow-hidden">
                  {exp.previewUrl ? (
                    <video
                      src={exp.previewUrl}
                      preload="metadata"
                      muted
                      playsInline
                      className="h-full w-full object-cover"
                      onMouseEnter={(e) => (e.target as HTMLVideoElement).play().catch(() => {})}
                      onMouseLeave={(e) => { (e.target as HTMLVideoElement).pause(); (e.target as HTMLVideoElement).currentTime = 0; }}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Video size={28} className="text-[var(--color-text-muted)] opacity-30" />
                    </div>
                  )}
                  {/* Duration badge */}
                  {exp.durationSeconds && (
                    <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      {formatDuration(exp.durationSeconds)}
                    </span>
                  )}
                </div>
                {/* Info */}
                <div className="p-3">
                  <p className="truncate text-sm font-medium text-[var(--color-text)]">
                    {exp.previewTitle ?? exp.filename ?? "Untitled"}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-[var(--color-text-muted)]">
                    {exp.projectTitle}
                    {exp.versionName && ` / ${exp.versionName}`}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                    <span>{exp.resolution}</span>
                    {exp.aspectRatio && <span>{exp.aspectRatio}</span>}
                    {exp.fileSizeBytes && <span>{formatBytes(exp.fileSizeBytes)}</span>}
                    <span className="ml-auto flex items-center gap-0.5">
                      <Clock size={10} /> {timeAgo(exp.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─── Credits placeholder ─────────────────────────────────── */}
      {!isEmpty && (
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Credits & Usage</h2>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Credits tracking is coming soon. You currently have unlimited renders during the beta period.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="Total renders" value={stats.exportCount + stats.activeRenderCount} />
            <MiniStat label="Active renders" value={stats.activeRenderCount} />
            <MiniStat label="Photos uploaded" value={stats.totalAssets} />
            <MiniStat label="Storage used" value={formatBytes(stats.storageUsedBytes)} />
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 text-center">
      <Icon size={18} className="mx-auto mb-1 text-[var(--color-accent)] opacity-70" />
      <p className="text-lg font-bold text-[var(--color-text)]">{value}</p>
      <p className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide">{label}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-2">
      <p className="text-base font-bold text-[var(--color-text)]">{value}</p>
      <p className="text-[10px] text-[var(--color-text-muted)]">{label}</p>
    </div>
  );
}
