/**
 * FFmpeg command builder for Vionto renders.
 *
 * Generates deterministic pan/zoom Ken Burns presets, transition filters,
 * subtitle burn-in, and audio mixing for cinematic / slideshow / social modes.
 */

import type { RenderManifest, RenderAsset, MotionPreset, TransitionPreset, SubtitleStyle, VisualStyle } from "./render-manifest";

export type FFmpegStage =
  | "prepare"
  | "tts"
  | "images"
  | "transitions"
  | "audio_mix"
  | "subtitles"
  | "encode"
  | "upload"
  | "done";

export type FFmpegProgress = {
  stage: FFmpegStage;
  percent: number;
};

/** Resolution map for FFmpeg scale filter. */
const RESOLUTION_MAP: Record<string, { width: number; height: number }> = {
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
  "4k": { width: 3840, height: 2160 },
};

function even(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

function getTargetDimensions(resolution: string, aspectRatio: string): { width: number; height: number } {
  const res = RESOLUTION_MAP[resolution] ?? RESOLUTION_MAP["1080p"];
  const [arW, arH] = aspectRatio.split(":").map(Number);
  if (!arW || !arH) return res;

  if (arW === arH) {
    return { width: res.height, height: res.height };
  }

  if (arW < arH) {
    return { width: res.height, height: even(res.height * (arH / arW)) };
  }

  return { width: res.width, height: even(res.width * (arH / arW)) };
}

/** Deterministic motion presets per asset index (cycling). */
export function pickMotionPreset(index: number, mode: RenderManifest["mode"]): MotionPreset {
  const cinematicCycle: MotionPreset["name"][] = ["ken_burns", "pan_left", "zoom_in", "pan_right", "zoom_out"];
  const slideshowCycle: MotionPreset["name"][] = ["static", "static", "static", "static"];
  const socialCycle: MotionPreset["name"][] = ["zoom_in", "zoom_out", "ken_burns"];

  const cycle = mode === "cinematic" ? cinematicCycle : mode === "slideshow" ? slideshowCycle : socialCycle;
  const name = cycle[index % cycle.length];

  if (name === "ken_burns") {
    return { name, startScale: 1, endScale: 1.15, startX: -0.05, endX: 0.05, startY: -0.03, endY: 0.03, durationSeconds: 5 };
  }
  if (name === "pan_left") {
    return { name, startScale: 1.05, endScale: 1.05, startX: 0.05, endX: -0.05, startY: 0, endY: 0, durationSeconds: 5 };
  }
  if (name === "pan_right") {
    return { name, startScale: 1.05, endScale: 1.05, startX: -0.05, endX: 0.05, startY: 0, endY: 0, durationSeconds: 5 };
  }
  if (name === "zoom_in") {
    return { name, startScale: 1, endScale: 1.2, startX: 0, endX: 0, startY: 0, endY: 0, durationSeconds: 5 };
  }
  if (name === "zoom_out") {
    return { name, startScale: 1.2, endScale: 1, startX: 0, endX: 0, startY: 0, endY: 0, durationSeconds: 5 };
  }
  return { name: "static", startScale: 1, endScale: 1, startX: 0, endX: 0, startY: 0, endY: 0, durationSeconds: 5 };
}

/** Deterministic transition preset per pair index. */
export function pickTransitionPreset(index: number, mode: RenderManifest["mode"]): TransitionPreset {
  const cinematic: TransitionPreset["name"][] = ["fade", "crossfade", "fade", "crossfade"];
  const slideshow: TransitionPreset["name"][] = ["fade", "none", "fade", "none"];
  const social: TransitionPreset["name"][] = ["slide_left", "slide_right", "fade"];
  const cycle = mode === "cinematic" ? cinematic : mode === "slideshow" ? slideshow : social;
  return { name: cycle[index % cycle.length], durationSeconds: mode === "social" ? 0.3 : 0.5 };
}

/** Build FFmpeg zoompan expression from a motion preset. */
function buildZoompanExpr(motion: MotionPreset, frameRate: number, totalFrames: number): { zExpr: string; xExpr: string; yExpr: string } {
  const frames = Math.max(1, totalFrames);
  const t = "on";
  const z0 = motion.startScale;
  const z1 = motion.endScale;
  const x0 = motion.startX;
  const x1 = motion.endX;
  const y0 = motion.startY;
  const y1 = motion.endY;

  const zExpr = `${z0}+(${z1}-${z0})*${t}/${frames}`;
  const xExpr = `(iw-iw/${z0}-(iw-iw/${z1})*${t}/${frames})*(${x0}+(${x1}-${x0})*${t}/${frames})`;
  const yExpr = `(ih-ih/${z0}-(ih-ih/${z1})*${t}/${frames})*(${y0}+(${y1}-${y0})*${t}/${frames})`;

  return { zExpr, xExpr, yExpr };
}

function buildVisualStyleFilters(style: VisualStyle, hasSubtitles: boolean): string[] {
  switch (style) {
    case "film_grain":
      return ["eq=contrast=1.05:saturation=0.92", "noise=alls=8:allf=t+u", "vignette=PI/6"];
    case "polaroid_memory":
      return ["eq=brightness=0.03:contrast=1.04:saturation=0.85", "vignette=PI/5"];
    case "travel_map_overlay":
      return ["eq=saturation=1.12:contrast=1.04", "drawgrid=width=iw/6:height=ih/6:thickness=1:color=white@0.10"];
    case "vhs_archive":
      return ["eq=contrast=1.12:saturation=0.70", "noise=alls=14:allf=t+u", "drawbox=x=0:y=0:w=iw:h=ih:color=black@0.12:t=6"];
    case "wedding_cinematic":
      return ["eq=contrast=1.08:saturation=1.06:brightness=0.01", "unsharp=5:5:0.45:3:3:0.15", "vignette=PI/7"];
    case "social_vertical_captions":
      return hasSubtitles
        ? ["eq=contrast=1.10:saturation=1.12", "drawbox=x=0:y=ih*0.39:w=iw:h=ih*0.22:color=black@0.34:t=fill"]
        : ["eq=contrast=1.10:saturation=1.12"];
    case "clean_modern_slideshow":
    default:
      return [];
  }
}

/** Build a single image-to-video segment command (no transitions). */
function buildImageSegmentCmd(
  asset: RenderAsset,
  motion: MotionPreset,
  resolution: string,
  aspectRatio: string,
  frameRate: number,
  outputPath: string
): string[] {
  const res = getTargetDimensions(resolution, aspectRatio);
  const duration = asset.durationSeconds ?? motion.durationSeconds;
  const totalFrames = Math.max(1, Math.round(duration * frameRate));
  const { zExpr, xExpr, yExpr } = buildZoompanExpr(motion, frameRate, totalFrames);

  // Scale to fill (center-crop) then apply Ken Burns motion.
  // "increase" + crop ensures the frame is always filled — no letterbox/pillarbox
  // black bars even when the source image has a different aspect ratio than the target.
  return [
    "-framerate", String(frameRate),
    "-loop", "1",
    "-i", asset.storageKey,
    "-vf",
    `scale=${res.width}:${res.height}:force_original_aspect_ratio=increase,crop=${res.width}:${res.height},zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=${totalFrames}:s=${res.width}x${res.height},fps=${frameRate}`,
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-t", String(duration),
    "-an",
    "-y",
    outputPath,
  ];
}

/** Build the concat demuxer file list for transitions. */
function buildConcatList(segmentPaths: string[], listPath: string): string {
  const lines = segmentPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
  return lines;
}

/** Escape a filesystem path for use inside an FFmpeg filter argument. */
function escapeFilterPath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

function hexToASSColor(hex: string): string {
  const clean = hex.replace("#", "");
  if (clean.length < 6) return "&H00FFFFFF";
  const r = clean.substring(0, 2);
  const g = clean.substring(2, 4);
  const b = clean.substring(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

function hexToASSColorWithAlpha(hex: string, opacity: number): string {
  const alpha = Math.round((1 - opacity) * 255).toString(16).padStart(2, "0").toUpperCase();
  const clean = hex.replace("#", "");
  if (clean.length < 6) return `&H${alpha}000000`;
  const r = clean.substring(0, 2);
  const g = clean.substring(2, 4);
  const b = clean.substring(4, 6);
  return `&H${alpha}${b}${g}${r}`.toUpperCase();
}

/** Build subtitle burn-in filter string (ASS style overlay). */
function buildSubtitleFilter(style: SubtitleStyle, srtPath: string, dimensions: { width: number; height: number }): string {
  const font = style.fontName.replace(/:/g, "\\:");
  const size = style.fontSize;
  const outlineW = style.outlineWidth;
  const isBold = style.fontWeight === "bold" ? 1 : 0;

  const primaryColor = hexToASSColor(style.color ?? "#ffffff");
  const outlineColor = hexToASSColor(style.outlineColor ?? "#000000");

  const bgOpacity = style.backgroundOpacity ?? 0;
  const bgColor = style.backgroundColor && style.backgroundColor !== "transparent" && bgOpacity > 0
    ? hexToASSColorWithAlpha(style.backgroundColor, bgOpacity)
    : "&HFF000000";

  const shadowVal = style.shadow ? (style.shadowOffset ?? 2) : 0;

  const alignMap = { bottom: { left: 1, center: 2, right: 3 }, center: { left: 4, center: 5, right: 6 }, top: { left: 7, center: 8, right: 9 } };
  const vPos = style.position ?? "bottom";
  const hAlign = style.alignment ?? "center";
  const alignment = alignMap[vPos]?.[hAlign] ?? 2;

  const marginV = style.marginV ?? 40;
  const marginH = style.marginH ?? 40;

  const styleParts = [
    `FontName=${font}`,
    `FontSize=${size}`,
    `Bold=${isBold}`,
    `PrimaryColour=${primaryColor}`,
    `OutlineColour=${outlineColor}`,
    `BackColour=${bgColor}`,
    `Outline=${outlineW}`,
    `Shadow=${shadowVal}`,
    `Alignment=${alignment}`,
    `MarginV=${marginV}`,
    `MarginL=${marginH}`,
    `MarginR=${marginH}`,
    `BorderStyle=${bgOpacity > 0 ? 3 : 1}`,
  ];

  return `subtitles=filename='${escapeFilterPath(srtPath)}':original_size=${dimensions.width}x${dimensions.height}:force_style='${styleParts.join(",")}'`;
}

/** Build the full FFmpeg pipeline command array for a render manifest. */
export function buildRenderCommand(
  manifest: RenderManifest,
  workDir: string,
  opts: {
    narrationWavPath?: string;
    musicPath?: string;
    srtPath?: string;
    outputPath: string;
  }
): { steps: string[][]; concatListPath?: string } {
  const { mode, resolution, frameRate, assets, aspectRatio, visualStyle } = manifest;
  const res = getTargetDimensions(resolution, aspectRatio);
  const steps: string[][] = [];
  const segmentPaths: string[] = [];

  // Stage 1: generate per-image segments with motion
  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    const motion = asset.motion ?? pickMotionPreset(i, mode);
    const segPath = `${workDir}/seg_${String(i).padStart(4, "0")}.mp4`;
    segmentPaths.push(segPath);
    steps.push(buildImageSegmentCmd(asset, motion, resolution, aspectRatio, frameRate, segPath));
  }

  // Stage 2: concat segments
  const listPath = `${workDir}/concat_list.txt`;
  // We return the concat list content separately so the caller can write it

  // Stage 3: build final encode with audio and optional subtitles
  const finalArgs: string[] = [
    "-f", "concat",
    "-safe", "0",
    "-i", listPath,
  ];

  // Audio inputs
  if (opts.narrationWavPath) {
    finalArgs.push("-i", opts.narrationWavPath);
  }
  if (opts.musicPath) {
    finalArgs.push("-i", opts.musicPath);
  }

  // Video filter: visual style treatment and subtitles burn-in if requested
  let videoFilter = "";
  if (manifest.burnSubtitles && opts.srtPath) {
    videoFilter = buildSubtitleFilter(manifest.subtitleStyle, opts.srtPath, res);
  }

  const narrationInputIndex = opts.narrationWavPath ? 1 : null;
  const musicInputIndex = opts.musicPath ? (opts.narrationWavPath ? 2 : 1) : null;
  const audioFilter = narrationInputIndex !== null && musicInputIndex !== null
    ? `[${narrationInputIndex}:a]volume=1.0[narration];[${musicInputIndex}:a]volume=0.06[music];[narration][music]amix=inputs=2:duration=first:dropout_transition=3:normalize=0[aout]`
    : "";

  const vfParts: string[] = [];
  // Center-crop to fill: eliminates any residual letterbox/pillarbox from concat.
  // Input segments are already correctly sized so this is effectively a no-op
  // for well-formed input, but guarantees exact WxH output in edge cases.
  vfParts.push(`scale=${res.width}:${res.height}:force_original_aspect_ratio=increase,crop=${res.width}:${res.height}`);
  vfParts.push(...buildVisualStyleFilters(visualStyle, Boolean(videoFilter)));
  if (videoFilter) vfParts.push(videoFilter);

  if (vfParts.length > 0) {
    finalArgs.push("-vf", vfParts.join(","));
  }

  finalArgs.push("-map", "0:v:0");

  if (audioFilter) {
    finalArgs.push("-filter_complex", audioFilter, "-map", "[aout]");
  } else if (narrationInputIndex !== null) {
    finalArgs.push("-map", `${narrationInputIndex}:a:0`);
  } else if (musicInputIndex !== null) {
    finalArgs.push("-map", `${musicInputIndex}:a:0`);
  }

  finalArgs.push(
    "-c:v", manifest.videoCodec,
    "-b:v", manifest.videoBitrate,
    "-c:a", manifest.audioCodec,
    "-b:a", manifest.audioBitrate,
    "-movflags", "+faststart",
    "-pix_fmt", "yuv420p",
    "-y",
    opts.outputPath,
  );

  steps.push(finalArgs);

  return { steps, concatListPath: listPath };
}

/** Build concat list file content. */
export function buildConcatListContent(segmentPaths: string[]): string {
  return segmentPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
}
