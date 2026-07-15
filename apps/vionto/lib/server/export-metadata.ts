import type { RenderManifest } from "./render-manifest";

const STOP_WORDS = new Set([
  "about", "after", "again", "along", "also", "amid", "among", "around", "because", "before",
  "being", "between", "could", "every", "from", "have", "into", "just", "like", "more",
  "most", "over", "that", "their", "them", "then", "there", "these", "they", "this",
  "through", "under", "with", "within", "would", "your", "you", "and", "the", "for",
  "are", "was", "were", "his", "her", "our", "she", "him", "its", "but", "not",
]);

export type AspectLabel = "landscape" | "portrait" | "1by1";

export type ExportMetadata = {
  filename: string;
  userMode: RenderManifest["mode"];
  renderMode: RenderManifest["mode"];
  aspectRatio: RenderManifest["aspectRatio"];
  aspectLabel: AspectLabel;
  storyKeywords: string[];
  previewTitle: string;
  previewSubtitle: string;
};

export function aspectLabelForRatio(aspectRatio: string): AspectLabel {
  if (aspectRatio === "9:16") return "portrait";
  if (aspectRatio === "1:1") return "1by1";
  return "landscape";
}

export function slugPart(value: string, maxLength = 24): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .slice(0, maxLength)
    .replace(/^_+|_+$/g, "");
}

export function extractStoryKeywords(text: string | undefined, fallback: string[] = []): string[] {
  const words = (text ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .match(/[a-z0-9]{3,}/g) ?? [];

  const counts = new Map<string, number>();
  for (const word of words) {
    if (STOP_WORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0]))
    .map(([word]) => slugPart(word))
    .filter(Boolean);

  const result: string[] = [];
  for (const word of [...ranked, ...fallback.map((item) => slugPart(item)), "memory", "story", "video"]) {
    if (word && !result.includes(word)) result.push(word);
    if (result.length === 3) break;
  }
  return result;
}

function formatTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

export function buildExportFilename(input: {
  mode: RenderManifest["mode"];
  aspectRatio: RenderManifest["aspectRatio"];
  keywords: string[];
  date?: Date;
}): string {
  const aspectLabel = aspectLabelForRatio(input.aspectRatio);
  const parts = [
    slugPart(input.mode, 20),
    aspectLabel,
    ...input.keywords.slice(0, 3).map((keyword) => slugPart(keyword)),
    formatTimestamp(input.date ?? new Date()),
  ].filter(Boolean);
  const base = parts.join("_").replace(/_+/g, "_").slice(0, 120).replace(/^_+|_+$/g, "");
  return `${base || "vionto_render"}.mp4`;
}

export function buildExportMetadata(input: {
  manifest: RenderManifest;
  projectTitle?: string | null;
  date?: Date;
}): ExportMetadata {
  const { manifest } = input;
  const keywords = extractStoryKeywords(manifest.narrationText, [input.projectTitle ?? "", manifest.mode]);
  const aspectLabel = aspectLabelForRatio(manifest.aspectRatio);
  const filename = buildExportFilename({
    mode: manifest.mode,
    aspectRatio: manifest.aspectRatio,
    keywords,
    date: input.date,
  });
  const readableAspect = aspectLabel === "1by1" ? "1:1" : aspectLabel;
  const keywordCopy = keywords.length > 1
    ? `${keywords.slice(0, -1).join(", ")}, and ${keywords.at(-1)}`
    : keywords[0] ?? "memory";

  return {
    filename,
    userMode: manifest.mode,
    renderMode: manifest.mode,
    aspectRatio: manifest.aspectRatio,
    aspectLabel,
    storyKeywords: keywords,
    previewTitle: `${input.projectTitle || "Vionto"} ${manifest.mode} render`,
    previewSubtitle: `Latest ${manifest.visualStyle.replace(/_/g, " ")} ${manifest.mode} ${readableAspect} render, built from ${keywordCopy}.`,
  };
}
