"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Images, Loader2, Upload } from "lucide-react";
import { ImageOrganizer } from "@/components/ImageOrganizer";
import type { ImageAsset } from "@/components/ImageOrganizer";
import { ViontoNav } from "@/components/ViontoNav";

const DEMO_IMAGES: ImageAsset[] = [
  {
    id: "demo-1",
    storageKey: "demo/mountain.jpg",
    originalFilename: "mountain-sunrise.jpg",
    mimeType: "image/jpeg",
    width: 4000,
    height: 2667,
    fileSizeBytes: 3_200_000,
    caption: "Golden hour over the mountain range",
    tags: ["landscape", "sunrise", "mountains"],
    rating: 5,
    isFavorite: true,
    exifData: { make: "Canon", model: "EOS R5", focalLength: 24, fNumber: 8, exposureTime: 0.004, iso: 100 },
    createdAt: "2025-12-15T08:30:00Z",
    url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200",
    thumbnailUrl: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=300",
  },
  {
    id: "demo-2",
    storageKey: "demo/forest.jpg",
    originalFilename: "forest-path.jpg",
    mimeType: "image/jpeg",
    width: 3840,
    height: 2560,
    fileSizeBytes: 2_800_000,
    caption: "Misty morning in the enchanted forest",
    tags: ["nature", "forest", "mist"],
    rating: 4,
    isFavorite: false,
    exifData: { make: "Sony", model: "A7 IV", focalLength: 35, fNumber: 2.8, exposureTime: 0.008, iso: 400 },
    createdAt: "2025-11-20T06:15:00Z",
    url: "https://images.unsplash.com/photo-1448375240586-882707db888b?w=1200",
    thumbnailUrl: "https://images.unsplash.com/photo-1448375240586-882707db888b?w=300",
  },
  {
    id: "demo-3",
    storageKey: "demo/ocean.jpg",
    originalFilename: "ocean-waves.jpg",
    mimeType: "image/jpeg",
    width: 5472,
    height: 3648,
    fileSizeBytes: 5_100_000,
    caption: "Crashing waves at sunset beach",
    tags: ["ocean", "sunset", "waves"],
    rating: 3,
    isFavorite: false,
    exifData: { make: "Nikon", model: "Z6 III", focalLength: 70, fNumber: 5.6, exposureTime: 0.001, iso: 200 },
    createdAt: "2025-10-05T17:45:00Z",
    url: "https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=1200",
    thumbnailUrl: "https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=300",
  },
  {
    id: "demo-4",
    storageKey: "demo/city.jpg",
    originalFilename: "city-night.jpg",
    mimeType: "image/jpeg",
    width: 3000,
    height: 4000,
    fileSizeBytes: 4_300_000,
    caption: "Neon-lit streets of the city",
    tags: ["urban", "night", "neon"],
    rating: 4,
    isFavorite: true,
    exifData: { make: "Fujifilm", model: "X-T5", focalLength: 23, fNumber: 1.4, exposureTime: 0.02, iso: 1600 },
    createdAt: "2025-09-18T22:10:00Z",
    url: "https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=1200",
    thumbnailUrl: "https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=300",
  },
  {
    id: "demo-5",
    storageKey: "demo/flowers.jpg",
    originalFilename: "spring-flowers.jpg",
    mimeType: "image/jpeg",
    width: 4032,
    height: 3024,
    fileSizeBytes: 2_100_000,
    caption: "Vibrant spring blooms in the garden",
    tags: ["flowers", "spring", "macro"],
    rating: 3,
    isFavorite: false,
    exifData: { make: "Apple", model: "iPhone 15 Pro", focalLength: 6.86, fNumber: 1.78, exposureTime: 0.003, iso: 50 },
    createdAt: "2026-03-22T14:00:00Z",
    url: "https://images.unsplash.com/photo-1490750967868-88aa4f1df32d?w=1200",
    thumbnailUrl: "https://images.unsplash.com/photo-1490750967868-88aa4f1df32d?w=300",
  },
  {
    id: "demo-6",
    storageKey: "demo/architecture.jpg",
    originalFilename: "modern-architecture.jpg",
    mimeType: "image/jpeg",
    width: 3500,
    height: 2333,
    fileSizeBytes: 3_600_000,
    caption: "Lines and curves of modern architecture",
    tags: ["architecture", "modern", "minimal"],
    rating: 5,
    isFavorite: false,
    exifData: { make: "Leica", model: "Q3", focalLength: 28, fNumber: 4, exposureTime: 0.005, iso: 100 },
    createdAt: "2026-01-10T11:30:00Z",
    url: "https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=1200",
    thumbnailUrl: "https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=300",
  },
];

export function OrganizerPageClient() {
  const { data: session, status } = useSession();
  const [images, setImages] = useState<ImageAsset[]>(DEMO_IMAGES);
  const [loading, setLoading] = useState(false);

  const handleUpdateAsset = (id: string, updates: Partial<ImageAsset>) => {
    setImages((prev) => prev.map((img) => (img.id === id ? { ...img, ...updates } : img)));
  };

  return (
    <>
      <ViontoNav />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--color-text)]">
              <Images size={28} className="text-[var(--color-primary)]" />
              Image Organizer
            </h1>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Click any image to open the lightbox. Use keyboard shortcuts for quick navigation.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-1.5 text-xs text-[var(--color-text-muted)]">
              <kbd className="font-mono">Esc</kbd> close &middot;{" "}
              <kbd className="font-mono">&larr;&rarr;</kbd> nav &middot;{" "}
              <kbd className="font-mono">I</kbd> info &middot;{" "}
              <kbd className="font-mono">E</kbd> edit &middot;{" "}
              <kbd className="font-mono">R</kbd> rotate
            </span>
          </div>
        </div>

        {/* Image Organizer */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-[var(--color-primary)]" />
          </div>
        ) : (
          <ImageOrganizer images={images} onUpdateAsset={handleUpdateAsset} />
        )}
      </main>
    </>
  );
}
