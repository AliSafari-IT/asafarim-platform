"use client";

import { useState, useCallback } from "react";
import { Image as ImageIcon, Grid, LayoutList, SlidersHorizontal } from "lucide-react";
import type { ImageAsset } from "./types";
import { Lightbox } from "./Lightbox";

type ImageOrganizerProps = {
  images: ImageAsset[];
  onUpdateAsset?: (id: string, updates: Partial<ImageAsset>) => void;
};

type ViewMode = "grid" | "list";

export function ImageOrganizer({ images, onUpdateAsset }: ImageOrganizerProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [assets, setAssets] = useState<ImageAsset[]>(images);

  const handleUpdateAsset = useCallback(
    (id: string, updates: Partial<ImageAsset>) => {
      setAssets((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
      onUpdateAsset?.(id, updates);
    },
    [onUpdateAsset]
  );

  const openLightbox = (index: number) => setLightboxIndex(index);
  const closeLightbox = () => setLightboxIndex(null);

  if (assets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-[var(--color-border)] p-16 text-center">
        <div className="rounded-full bg-[var(--color-surface-soft)] p-4">
          <ImageIcon size={32} className="text-[var(--color-text-subtle)]" />
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">No images uploaded yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={16} className="text-[var(--color-text-muted)]" />
          <span className="text-sm font-medium text-[var(--color-text-muted)]">
            {assets.length} image{assets.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] p-0.5">
          <ViewToggle icon={<Grid size={16} />} active={viewMode === "grid"} onClick={() => setViewMode("grid")} label="Grid" />
          <ViewToggle icon={<LayoutList size={16} />} active={viewMode === "list"} onClick={() => setViewMode("list")} label="List" />
        </div>
      </div>

      {/* Grid View */}
      {viewMode === "grid" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {assets.map((asset, idx) => (
            <GridItem key={asset.id} asset={asset} onClick={() => openLightbox(idx)} />
          ))}
        </div>
      )}

      {/* List View */}
      {viewMode === "list" && (
        <div className="space-y-2">
          {assets.map((asset, idx) => (
            <ListItem key={asset.id} asset={asset} onClick={() => openLightbox(idx)} />
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <Lightbox
          images={assets}
          initialIndex={lightboxIndex}
          onClose={closeLightbox}
          onUpdateAsset={handleUpdateAsset}
        />
      )}
    </div>
  );
}

function GridItem({ asset, onClick }: { asset: ImageAsset; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group relative aspect-square w-full overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] transition hover:border-[var(--color-primary)] hover:shadow-lg hover:shadow-[var(--color-primary)]/10"
    >
      {asset.thumbnailUrl || asset.url ? (
        <img
          src={asset.thumbnailUrl || asset.url}
          alt={asset.caption || asset.originalFilename}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <ImageIcon size={24} className="text-[var(--color-text-subtle)]" />
        </div>
      )}
      {/* Hover overlay */}
      <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition group-hover:opacity-100">
        <div className="w-full p-2">
          <p className="truncate text-xs font-medium text-white">{asset.originalFilename}</p>
          <p className="text-[10px] text-white/60">
            {asset.width}x{asset.height}
          </p>
        </div>
      </div>
      {/* Favorite badge */}
      {asset.isFavorite && (
        <div className="absolute right-1.5 top-1.5 rounded-full bg-black/50 p-1 backdrop-blur-sm">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--coral)" stroke="none">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </div>
      )}
    </button>
  );
}

function ListItem({ asset, onClick }: { asset: ImageAsset; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-2.5 text-left transition hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-elevated)]"
    >
      <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg">
        {asset.thumbnailUrl || asset.url ? (
          <img
            src={asset.thumbnailUrl || asset.url}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[var(--color-surface)]">
            <ImageIcon size={16} className="text-[var(--color-text-subtle)]" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--color-text)]">{asset.originalFilename}</p>
        <p className="text-xs text-[var(--color-text-muted)]">
          {asset.width}x{asset.height} &middot; {(asset.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB
        </p>
      </div>
      {asset.isFavorite && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--coral)" stroke="none" className="flex-shrink-0">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      )}
    </button>
  );
}

function ViewToggle({ icon, active, onClick, label }: { icon: React.ReactNode; active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`rounded-md p-1.5 transition ${
        active
          ? "bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
          : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      }`}
    >
      {icon}
    </button>
  );
}
