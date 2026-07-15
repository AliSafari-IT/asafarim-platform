import type { NormalizedTrackMetadata } from "./server/pixabay-music";
import type { AudioLibraryItem } from "./server/storage";

export type { AudioLibraryItem };

export function makeSpacesTrackMetadata(item: AudioLibraryItem, fallbackArtist: string): NormalizedTrackMetadata {
  const title = item.filename.replace(/\.[^/.]+$/, "").replace(/_/g, " ");
  return {
    provider: "spaces",
    trackId: item.key,
    title: title || item.filename,
    artist: fallbackArtist,
    artistId: "spaces",
    duration: undefined,
    tags: ["library"],
    sourceUrl: item.publicUrl,
    downloadUrl: item.publicUrl,
    license: "spaces",
    licenseInfo: "Track from your personal music library on DO Spaces",
    downloads: 0,
    likes: 0,
    storageKey: item.key,
  };
}

export function makeCommonTrackMetadata(item: AudioLibraryItem, fallbackArtist: string): NormalizedTrackMetadata {
  const title = item.filename.replace(/\.[^/.]+$/, "").replace(/_/g, " ");
  return {
    provider: "common",
    trackId: item.key,
    title: title || item.filename,
    artist: fallbackArtist,
    artistId: "common",
    duration: undefined,
    tags: ["common"],
    sourceUrl: item.publicUrl,
    downloadUrl: item.publicUrl,
    license: "common",
    licenseInfo: "Shared music track from the common Vionto library",
    downloads: 0,
    likes: 0,
    storageKey: item.key,
  };
}
