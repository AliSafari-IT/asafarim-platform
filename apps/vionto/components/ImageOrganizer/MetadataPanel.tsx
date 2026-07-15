"use client";

import { useState, useCallback } from "react";
import {
  X,
  Star,
  Heart,
  Camera,
  Calendar,
  HardDrive,
  Maximize2,
  Tag,
  Plus,
} from "lucide-react";
import type { ImageAsset } from "./types";

type MetadataPanelProps = {
  asset: ImageAsset;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (updates: Partial<ImageAsset>) => void;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MetadataPanel({ asset, isOpen, onClose, onUpdate }: MetadataPanelProps) {
  const [caption, setCaption] = useState(asset.caption || "");
  const [tagInput, setTagInput] = useState("");
  const [rating, setRating] = useState(asset.rating || 0);
  const [isFavorite, setIsFavorite] = useState(asset.isFavorite || false);

  const handleCaptionBlur = useCallback(() => {
    if (caption !== (asset.caption || "")) {
      onUpdate({ caption });
    }
  }, [caption, asset.caption, onUpdate]);

  const handleAddTag = useCallback(() => {
    const tag = tagInput.trim();
    if (!tag) return;
    const currentTags = asset.tags || [];
    if (!currentTags.includes(tag)) {
      onUpdate({ tags: [...currentTags, tag] });
    }
    setTagInput("");
  }, [tagInput, asset.tags, onUpdate]);

  const handleRemoveTag = useCallback(
    (tag: string) => {
      const currentTags = asset.tags || [];
      onUpdate({ tags: currentTags.filter((t) => t !== tag) });
    },
    [asset.tags, onUpdate]
  );

  const handleRating = useCallback(
    (value: number) => {
      const newRating = value === rating ? 0 : value;
      setRating(newRating);
      onUpdate({ rating: newRating });
    },
    [rating, onUpdate]
  );

  const handleFavorite = useCallback(() => {
    const newFav = !isFavorite;
    setIsFavorite(newFav);
    onUpdate({ isFavorite: newFav });
  }, [isFavorite, onUpdate]);

  const exif = asset.exifData as Record<string, string | number | undefined> | null;

  return (
    <div
      className={`fixed right-0 top-0 z-[10000] h-full w-80 transform overflow-y-auto border-l border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] shadow-xl transition-transform duration-300 ${
        isOpen ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="sticky top-0 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Image Info
        </h3>
        <button
          onClick={onClose}
          className="rounded-full p-1 text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-soft)] hover:text-[var(--color-text)]"
        >
          <X size={18} />
        </button>
      </div>

      <div className="space-y-5 p-4">
        {/* Rating & Favorite */}
        <div className="flex items-center justify-between">
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                onClick={() => handleRating(v)}
                className="p-0.5 transition hover:scale-110"
              >
                <Star
                  size={18}
                  className={v <= rating ? "fill-[var(--gold)] text-[var(--gold)]" : "text-[var(--color-text-subtle)]"}
                />
              </button>
            ))}
          </div>
          <button
            onClick={handleFavorite}
            className="rounded-full p-1.5 transition hover:bg-[var(--color-surface-soft)]"
          >
            <Heart
              size={20}
              className={isFavorite ? "fill-[var(--coral)] text-[var(--coral)]" : "text-[var(--color-text-subtle)]"}
            />
          </button>
        </div>

        {/* Caption */}
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Caption</label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onBlur={handleCaptionBlur}
            placeholder="Add a description..."
            rows={3}
            className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>

        {/* Tags */}
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Tags</label>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {(asset.tags || []).map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary-soft)] px-2.5 py-0.5 text-xs font-medium text-[var(--color-primary)]"
              >
                <Tag size={10} />
                {tag}
                <button onClick={() => handleRemoveTag(tag)} className="ml-0.5 hover:text-[var(--coral)]">
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
              placeholder="Add tag..."
              className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2.5 py-1.5 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:border-[var(--color-primary)] focus:outline-none"
            />
            <button
              onClick={handleAddTag}
              className="rounded-lg bg-[var(--color-primary-soft)] p-1.5 text-[var(--color-primary)] transition hover:bg-[var(--color-primary)] hover:text-white"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        {/* File Details */}
        <div className="space-y-2.5">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Details</h4>
          <InfoRow icon={<HardDrive size={14} />} label="File" value={asset.originalFilename} />
          <InfoRow icon={<Maximize2 size={14} />} label="Size" value={`${asset.width} x ${asset.height} px`} />
          <InfoRow icon={<HardDrive size={14} />} label="Weight" value={formatBytes(asset.fileSizeBytes)} />
          <InfoRow icon={<Calendar size={14} />} label="Uploaded" value={formatDate(asset.createdAt)} />
        </div>

        {/* EXIF Data */}
        {exif && Object.keys(exif).length > 0 && (
          <div className="space-y-2.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              <Camera size={12} className="mr-1 inline" />
              Camera Data
            </h4>
            {exif.make != null && <InfoRow label="Camera" value={`${exif.make} ${exif.model ?? ""}`} />}
            {exif.focalLength != null && <InfoRow label="Focal" value={`${exif.focalLength}mm`} />}
            {exif.fNumber != null && <InfoRow label="Aperture" value={`f/${exif.fNumber}`} />}
            {exif.exposureTime != null && <InfoRow label="Shutter" value={`1/${Math.round(1 / Number(exif.exposureTime))}s`} />}
            {exif.iso != null && <InfoRow label="ISO" value={String(exif.iso)} />}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {icon && <span className="text-[var(--color-text-subtle)]">{icon}</span>}
      <span className="text-[var(--color-text-muted)]">{label}:</span>
      <span className="truncate font-medium text-[var(--color-text)]">{value}</span>
    </div>
  );
}
