/**
 * Vionto Render Worker â€” BullMQ worker for FFmpeg pipeline jobs.
 *
 * Processes render manifests from Redis, runs TTS â†’ images â†’ audio mix â†’
 * FFmpeg encode â†’ upload, and updates the render job row in Postgres.
 */

import { Worker } from "bullmq";
import Redis from "ioredis";
import { spawn } from "node:child_process";
import { mkdir, writeFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";
import { prisma } from "@asafarim/db";
import { Prisma } from "@asafarim/db";
import { safeParseManifest } from "./lib/server/render-manifest";
import { buildRenderCommand, buildConcatListContent, pickMotionPreset } from "./lib/server/ffmpeg";
import { buildExportMetadata } from "./lib/server/export-metadata";
import { synthesizeSpeech } from "./lib/server/tts";
import { buildKey, downloadObjectToLocalFile, uploadLocalFileToStorage, createPresignedDownloadUrl, getStorageStatus } from "./lib/server/storage";
import { QUEUE_NAME, getRenderQueue } from "./lib/server/queue";
import { parseSrt, buildSrt, buildVtt, applyTransformToCues, wrapAllCues, generateSrtFromText } from "./lib/server/srt";
import { advanceAlbumLifecycleStage } from "./lib/server/album-lifecycle";


const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  throw new Error("REDIS_URL environment variable is required. Please set it to redis://localhost:6380 or your Redis instance URL.");
}
const WORKER_HEALTH_PORT = Number.parseInt(process.env.WORKER_HEALTH_PORT ?? "3007", 10);
const FFMPEG_BIN = process.env.FFMPEG_PATH ?? "ffmpeg";
const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
let isShuttingDown = false;

/** Failure classification for telemetry and retry decisions. */
function classifyError(err: unknown): { category: string; retryable: boolean } {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("ENOENT") || msg.includes("executable not found") || msg.includes("not recognized")) {
    return { category: "FFMPEG_NOT_FOUND", retryable: false };
  }
  if (msg.includes("ffmpeg exited")) return { category: "FFMPEG_FAILED", retryable: false };
  if (msg.includes("Disk full") || msg.includes("ENOSPC")) {
    return { category: "DISK_FULL", retryable: false };
  }
  if (msg.includes("TTS") || msg.includes("openai") || msg.includes("elevenlabs") || msg.includes("azure")) {
    return { category: "TTS_FAILURE", retryable: true };
  }
  if (msg.includes("timeout") || msg.includes("ETIMEDOUT")) {
    return { category: "TIMEOUT", retryable: true };
  }
  if (msg.includes("network") || msg.includes("ECONNREFUSED")) {
    return { category: "NETWORK", retryable: true };
  }
  return { category: "UNKNOWN", retryable: true };
}

async function appendLog(jobId: string, line: string) {
  await prisma.viontoRenderJob.updateMany({
    where: { id: jobId },
    data: { logs: { push: line } as unknown as string }, // Prisma JSON ops not available for String; raw query below
  });
}

async function setLog(jobId: string, lines: string[]) {
  await prisma.$executeRawUnsafe(
    `UPDATE "ViontoRenderJob" SET logs = $1 WHERE id = $2`,
    lines.join("\n"),
    jobId
  );
}

async function updateState(
  jobId: string,
  state: string,
  opts: { progressPercent?: number; errorSummary?: string; retryCount?: number; completedAt?: Date } = {}
) {
  await prisma.viontoRenderJob.update({
    where: { id: jobId },
    data: {
      state,
      progressPercent: opts.progressPercent ?? undefined,
      errorSummary: opts.errorSummary ?? undefined,
      retryCount: opts.retryCount ?? undefined,
      completedAt: opts.completedAt ?? undefined,
    },
  });
}

/** Run an FFmpeg command and stream stdout/stderr to logs. */
function runFfmpeg(args: string[], workDir: string, logLines: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    logLines.push(`FFmpeg args: ${args.join(" ")}`);
    const proc = spawn(FFMPEG_BIN, args, {
      cwd: workDir,
      shell: false,
    });
    const lines: string[] = [];
    proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      for (const line of text.split("\n")) {
        if (line.trim()) {
          lines.push(line.trim());
          if (lines.length > 200) lines.shift(); // keep last 200
        }
      }
    });
    proc.on("close", (code) => {
      logLines.push(...lines);
      if (code === 0) resolve();
      else {
        const detail = lines.at(-1);
        reject(new Error(`ffmpeg exited ${code}${detail ? `: ${detail}` : ""}`));
      }
    });
    proc.on("error", (err) => {
      const message = err.message.includes("ENOENT")
        ? `ffmpeg executable not found. Install ffmpeg or set FFMPEG_PATH. Tried: ${FFMPEG_BIN}`
        : `ffmpeg spawn error: ${err.message}`;
      logLines.push(message);
      reject(new Error(message));
    });
  });
}

async function downloadUrlToLocalFile(url: string, path: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`download failed ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(path, buffer);
}

async function isCancelled(jobId: string): Promise<boolean> {
  const job = await prisma.viontoRenderJob.findUnique({ where: { id: jobId }, select: { state: true } });
  return job?.state === "cancelled";
}

/**
 * Probe an audio/video file and return its duration in milliseconds.
 * Uses ffprobe (ships alongside ffmpeg) so no extra dependency is needed.
 */
async function getAudioDurationMs(filePath: string): Promise<number> {
  const FFPROBE_BIN = process.env.FFPROBE_PATH ?? "ffprobe";
  return new Promise((resolve, reject) => {
    const proc = spawn(FFPROBE_BIN, [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      filePath,
    ]);
    let out = "";
    proc.stdout.on("data", (chunk: Buffer) => { out += chunk.toString(); });
    proc.on("close", (code) => {
      if (code !== 0) { reject(new Error(`ffprobe exited ${code}`)); return; }
      try {
        const json = JSON.parse(out) as { format?: { duration?: string } };
        const secs = parseFloat(json.format?.duration ?? "0");
        resolve(Math.round(secs * 1000));
      } catch (e) {
        reject(new Error(`Failed to parse ffprobe output: ${e}`));
      }
    });
    proc.on("error", (e) => reject(new Error(
      e.message.includes("ENOENT")
        ? `ffprobe not found. Install ffmpeg or set FFPROBE_PATH. Tried: ${FFPROBE_BIN}`
        : `ffprobe error: ${e.message}`
    )));
  });
}

/** Main job processor. */
async function processRenderJob(jobId: string, manifestRaw: unknown) {
  const logLines: string[] = [`[${new Date().toISOString()}] Job ${jobId} start`];

  // Parse manifest
  const manifestResult = safeParseManifest(manifestRaw);
  if (!manifestResult.success) {
    const error = `Invalid manifest: ${manifestResult.error.message}`;
    logLines.push(error);
    await setLog(jobId, logLines);
    await updateState(jobId, "failed", { errorSummary: error });
    throw new Error(error);
  }
  const manifest = manifestResult.data;
  const workDir = join(tmpdir(), "vionto-renders", jobId);
  await mkdir(workDir, { recursive: true });

  if (await isCancelled(jobId)) {
    logLines.push("Job cancelled before start");
    await setLog(jobId, logLines);
    await rm(workDir, { recursive: true, force: true }).catch(() => null);
    return;
  }

  await prisma.viontoRenderJob.update({
    where: { id: jobId },
    data: { state: "running", progressPercent: 5, startedAt: new Date(), errorSummary: null },
  });
  logLines.push("Manifest validated");

  try {
    // --- Materialize assets: download images (and AI clips) from storage ---
    logLines.push(`Materializing ${manifest.assets.length} assets…`);
    const localAssetPaths: string[] = [];
    const localClipPaths: (string | null)[] = [];
    for (let i = 0; i < manifest.assets.length; i++) {
      const asset = manifest.assets[i];
      const ext = extname(asset.storageKey).replace(/[^a-zA-Z0-9.]/g, "") || ".jpg";
      const localPath = join(workDir, `asset_${String(i).padStart(4, "0")}${ext}`);
      try {
        await downloadObjectToLocalFile(asset.storageKey, localPath);
        localAssetPaths.push(localPath);
        logLines.push(`Downloaded asset ${i}: ${asset.storageKey}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logLines.push(`Failed to download asset ${i}: ${msg}`);
        throw new Error(`Failed to download asset ${i}: ${msg}`);
      }

      // AI motion clip is optional — fall back to the static image on failure.
      if (asset.videoStorageKey) {
        const clipPath = join(workDir, `asset_${String(i).padStart(4, "0")}_clip.mp4`);
        try {
          await downloadObjectToLocalFile(asset.videoStorageKey, clipPath);
          localClipPaths.push(clipPath);
          logLines.push(`Downloaded AI clip ${i}: ${asset.videoStorageKey}`);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          logLines.push(`AI clip ${i} unavailable, falling back to static image: ${msg}`);
          localClipPaths.push(null);
        }
      } else {
        localClipPaths.push(null);
      }
    }
    await updateState(jobId, "running", { progressPercent: 15 });

    // --- Process subtitles: download/generate, apply transforms, export ---
    let srtPath: string | undefined;
    let srtContent: string | undefined;

    if (manifest.srtStorageKey) {
      srtPath = join(workDir, "subtitles.srt");
      try {
        await downloadObjectToLocalFile(manifest.srtStorageKey, srtPath);
        const { readFile } = await import("node:fs/promises");
        srtContent = await readFile(srtPath, "utf-8");
        logLines.push(`Downloaded SRT: ${manifest.srtStorageKey}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logLines.push(`Failed to download SRT: ${msg}`);
        srtPath = undefined;
      }
    } else if (manifest.srtText) {
      srtContent = manifest.srtText;
    } else if (manifest.narrationText && manifest.burnSubtitles) {
      const totalDuration = (manifest.targetDurationSeconds ?? 30) * 1000;
      const cues = generateSrtFromText(manifest.narrationText, 0, totalDuration, manifest.subtitleTiming);
      srtContent = buildSrt(cues);
      logLines.push("Generated SRT from narration text with timing config");
    }

    if (srtContent) {
      let cues = parseSrt(srtContent);

      const textTransform = manifest.subtitleStyle?.textTransform ?? "preserve";
      if (textTransform !== "preserve") {
        cues = applyTransformToCues(cues, textTransform);
        logLines.push(`Applied text transform: ${textTransform}`);
      }

      const maxLineWidth = manifest.subtitleStyle?.maxLineWidth ?? 42;
      const maxLines = manifest.subtitleStyle?.maxLines ?? 2;
      cues = wrapAllCues(cues, maxLineWidth, maxLines);

      srtContent = buildSrt(cues);
      srtPath = join(workDir, "subtitles.srt");
      await writeFile(srtPath, srtContent);
      logLines.push("Wrote processed SRT to local file");

      const subtitleExport = manifest.subtitleExport ?? { burnIn: true, exportSrt: false, exportVtt: false };
      if (subtitleExport.exportSrt) {
        const srtExportKey = buildKey(manifest.userId, "exports", manifest.projectId, "subtitles.srt");
        await writeFile(join(workDir, "export_subtitles.srt"), srtContent);
        await uploadLocalFileToStorage(join(workDir, "export_subtitles.srt"), srtExportKey, "text/plain");
        logLines.push(`Exported SRT file: ${srtExportKey}`);
      }
      if (subtitleExport.exportVtt) {
        const vttContent = buildVtt(cues);
        const vttExportKey = buildKey(manifest.userId, "exports", manifest.projectId, "subtitles.vtt");
        await writeFile(join(workDir, "export_subtitles.vtt"), vttContent);
        await uploadLocalFileToStorage(join(workDir, "export_subtitles.vtt"), vttExportKey, "text/vtt");
        logLines.push(`Exported VTT file: ${vttExportKey}`);
      }

      if (!manifest.burnSubtitles) {
        srtPath = undefined;
      }
    }

    // --- Audio materialization / TTS ---
    let narrationWavPath: string | undefined;
    let musicPath: string | undefined;
    const narrationTrack = manifest.audioTracks.find((t) => t.type === "narration");
    const musicTracks = manifest.audioTracks.filter((t) => t.type === "music" && (t.storageKey || t.downloadUrl));

    if (narrationTrack?.storageKey) {
      const ext = extname(narrationTrack.storageKey).replace(/[^a-zA-Z0-9.]/g, "") || ".mp3";
      narrationWavPath = join(workDir, `narration${ext}`);
      await downloadObjectToLocalFile(narrationTrack.storageKey, narrationWavPath);
      logLines.push(`Downloaded narration audio: ${narrationTrack.storageKey}`);
    } else if (manifest.narrationText) {
      logLines.push("Synthesizing narration…");
      const voiceId = narrationTrack?.voiceId ?? narrationTrack?.storageKey ?? "alloy";
      const ttsResult = await synthesizeSpeech(manifest.narrationText, voiceId);
      if (!ttsResult.ok) {
        throw new Error(`TTS failed: ${ttsResult.error}`);
      }
      narrationWavPath = join(workDir, "narration.mp3");
      await writeFile(narrationWavPath, ttsResult.audioBuffer);
      logLines.push(`TTS done (${ttsResult.provider}, ${ttsResult.latencyMs}ms)`);
    }

    if (musicTracks.length > 0) {
      const localMusicPaths: string[] = [];
      for (let i = 0; i < musicTracks.length; i++) {
        const track = musicTracks[i];
        const sourcePath = track.storageKey ?? track.downloadUrl ?? "";
        const sourceExt = (() => {
          try {
            return extname(track.storageKey ?? new URL(track.downloadUrl ?? "").pathname);
          } catch {
            return "";
          }
        })().replace(/[^a-zA-Z0-9.]/g, "") || ".mp3";
        const localPath = join(workDir, `music_${String(i).padStart(2, "0")}${sourceExt}`);
        if (track.storageKey) {
          await downloadObjectToLocalFile(track.storageKey, localPath);
          logLines.push(`Downloaded music audio: ${track.storageKey}`);
        } else if (track.downloadUrl) {
          await downloadUrlToLocalFile(track.downloadUrl, localPath);
          logLines.push(`Downloaded music audio from URL: ${track.downloadUrl}`);
        }
        localMusicPaths.push(localPath);
      }

      if (localMusicPaths.length === 1) {
        musicPath = localMusicPaths[0];
      } else {
        const musicConcatListPath = join(workDir, "music_concat_list.txt");
        await writeFile(
          musicConcatListPath,
          localMusicPaths.map((path) => `file '${path.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n")
        );
        musicPath = join(workDir, "music_playlist.m4a");
        await runFfmpeg([
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          musicConcatListPath,
          "-vn",
          "-c:a",
          "aac",
          "-b:a",
          "128k",
          "-y",
          musicPath,
        ], workDir, logLines);
        logLines.push(`Concatenated ${localMusicPaths.length} music tracks`);
      }
    }
    // --- Probe actual narration duration for A/V sync ---
    // TTS speaking speed doesn't match targetDurationSeconds, so we measure the
    // real audio length and use it as the single source of truth for both the
    // image segment timings and the SRT timestamps.
    let actualNarrationMs: number | null = null;
    if (narrationWavPath) {
      try {
        actualNarrationMs = await getAudioDurationMs(narrationWavPath);
        logLines.push(`Narration duration: ${(actualNarrationMs / 1000).toFixed(2)}s (target was ${manifest.targetDurationSeconds ?? 30}s)`);
      } catch (err) {
        logLines.push(`Warning: could not probe narration duration — sync may drift: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await updateState(jobId, "running", { progressPercent: 25 });

    if (await isCancelled(jobId)) {
      logLines.push("Job cancelled before encoding");
      await setLog(jobId, logLines);
      await rm(workDir, { recursive: true, force: true }).catch(() => null);
      return;
    }

    // --- Prepare image segments with local paths ---
    logLines.push("Generating image segments…");
    // Create a modified manifest with local paths instead of storage keys
    const localManifest = {
      ...manifest,
      assets: manifest.assets.map((asset, i) => ({
        ...asset,
        storageKey: localAssetPaths[i], // Replace storage key with local path
        videoStorageKey: localClipPaths[i] ?? undefined, // Local AI clip path when materialized
      })),
    };

    // --- Sync image pacing and SRT timestamps to actual narration duration ---
    if (actualNarrationMs !== null && actualNarrationMs > 0) {
      const actualNarrationSec = actualNarrationMs / 1000;
      const totalAssetSec = localManifest.assets.reduce((s, a) => s + (a.durationSeconds ?? 5), 0);

      // Rescale each image segment so total video length == narration length
      if (totalAssetSec > 0 && Math.abs(totalAssetSec - actualNarrationSec) > 0.5) {
        const scale = actualNarrationSec / totalAssetSec;
        logLines.push(`Rescaling image segments: ${totalAssetSec.toFixed(2)}s → ${actualNarrationSec.toFixed(2)}s (×${scale.toFixed(3)})`);
        for (const asset of localManifest.assets) {
          asset.durationSeconds = Math.max(1.0, Math.round((asset.durationSeconds ?? 5) * scale * 10) / 10);
        }
      }

      // Rescale SRT cue timestamps so subtitles span the actual narration window
      if (srtContent && srtPath) {
        const cues = parseSrt(srtContent);
        if (cues.length > 0) {
          const lastEnd = cues[cues.length - 1].endMs;
          if (lastEnd > 0 && Math.abs(lastEnd - actualNarrationMs) > 500) {
            const scale = actualNarrationMs / lastEnd;
            const rescaled = cues.map((cue) => ({
              ...cue,
              startMs: Math.round(cue.startMs * scale),
              endMs:   Math.round(cue.endMs   * scale),
            }));
            const rescaledSrt = buildSrt(rescaled);
            await writeFile(srtPath, rescaledSrt);
            logLines.push(`Rescaled SRT timestamps ×${scale.toFixed(3)} to match narration`);
          }
        }
      }
    }

    const { steps, concatListPath } = buildRenderCommand(localManifest, workDir, {
      narrationWavPath,
      musicPath,
      srtPath,
      outputPath: join(workDir, "output.mp4"),
    });

    // Fill in motion defaults for logging
    for (let i = 0; i < localManifest.assets.length; i++) {
      if (!localManifest.assets[i].motion) {
        localManifest.assets[i].motion = pickMotionPreset(i, localManifest.mode);
      }
    }

    // Run all segment generation steps except the final concat/encode
    for (let i = 0; i < steps.length - 1; i++) {
      if (await isCancelled(jobId)) {
        logLines.push(`Job cancelled during segment ${i + 1}/${steps.length - 1}`);
        await setLog(jobId, logLines);
        await rm(workDir, { recursive: true, force: true }).catch(() => null);
        return;
      }
      await runFfmpeg(steps[i], workDir, logLines);
      const progress = 25 + Math.round(((i + 1) / steps.length) * 35);
      await updateState(jobId, "running", { progressPercent: progress });
    }

    // Write concat list
    if (concatListPath) {
      const segmentPaths = steps.slice(0, -1).map((_s, i) => join(workDir, `seg_${String(i).padStart(4, "0")}.mp4`));
      await writeFile(concatListPath, buildConcatListContent(segmentPaths));
    }

    // --- Final encode ---
    logLines.push("Final encode…");
    logLines.push(`Final FFmpeg args: ${steps[steps.length - 1].join(" ")}`);
    await runFfmpeg(steps[steps.length - 1], workDir, logLines);
    await updateState(jobId, "running", { progressPercent: 75 });

    // --- Upload output ---
    logLines.push("Uploading output…");
    const outputPath = join(workDir, "output.mp4");
    const project = await prisma.viontoProject.findFirst({
      where: { id: manifest.projectId, userId: manifest.userId },
      select: { title: true, visualStyle: true, musicOption: true, musicTrackId: true, musicMetadata: true },
    });

    // If the manifest has a versionId, load music metadata from the version
    // (which is the authoritative source for per-version creative settings).
    const versionMusic = manifest.versionId
      ? await prisma.viontoVideoVersion.findUnique({
          where: { id: manifest.versionId },
          select: { musicOption: true, musicTrackId: true, musicMetadata: true },
        })
      : null;
    const exportMetadata = buildExportMetadata({
      manifest,
      projectTitle: project?.title,
      date: new Date(),
    });
    const outputKey = buildKey(manifest.userId, "exports", manifest.projectId, exportMetadata.filename);

    // Get file stats for metadata
    const fileStats = await stat(outputPath);
    const fileSizeBytes = fileStats.size;

    await uploadLocalFileToStorage(outputPath, outputKey, "video/mp4");
    logLines.push(`Output uploaded: ${outputKey}`);

    // Create export record with full metadata
    const musicSource = versionMusic ?? project;
    const exportRecord = await prisma.viontoExport.create({
      data: {
        projectId: manifest.projectId,
        versionId: manifest.versionId ?? null,
        userId: manifest.userId,
        renderJobId: jobId,
        storageKey: outputKey,
        format: manifest.outputFormat,
        resolution: manifest.resolution,
        fileSizeBytes,
        durationSeconds: manifest.targetDurationSeconds,
        filename: exportMetadata.filename,
        userMode: exportMetadata.userMode,
        renderMode: exportMetadata.renderMode,
        aspectRatio: exportMetadata.aspectRatio,
        aspectLabel: exportMetadata.aspectLabel,
        visualStyle: manifest.visualStyle,
        storyMode: manifest.storyMode ?? null,
        emotionalTone: manifest.emotionalTone ?? null,
        storyKeywords: exportMetadata.storyKeywords,
        previewTitle: exportMetadata.previewTitle,
        previewSubtitle: exportMetadata.previewSubtitle,
        musicOption: musicSource?.musicOption,
        musicTrackId: musicSource?.musicTrackId,
        musicMetadata: musicSource?.musicMetadata as Prisma.InputJsonValue | undefined,
      },
    });

    logLines.push(`Export record ${exportRecord.id} created`);
    await setLog(jobId, logLines);
    await updateState(jobId, "completed", { progressPercent: 100, completedAt: new Date() });
    const version = manifest.versionId
      ? await prisma.viontoVideoVersion.findFirst({
          where: { id: manifest.versionId, projectId: manifest.projectId },
          select: { albumId: true },
        })
      : null;
    await advanceAlbumLifecycleStage(prisma, {
      projectId: manifest.projectId,
      albumId: version?.albumId ?? null,
      stage: "published_exported",
    });

    // Cleanup work dir (keep in debug mode)
    if (process.env.NODE_ENV === "production") {
      await rm(workDir, { recursive: true, force: true });
    }
  } catch (err) {
    const { category, retryable } = classifyError(err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    logLines.push(`ERROR [${category}]: ${errorMsg}`);
    await setLog(jobId, logLines);

    const job = await prisma.viontoRenderJob.findUnique({ where: { id: jobId } });
    const retries = (job?.retryCount ?? 0) + 1;
    const maxRetries = manifest.maxRetries;

    if (retryable && retries <= maxRetries) {
      await updateState(jobId, "queued", { errorSummary: `${category}: ${errorMsg}`, retryCount: retries });
      // Re-queue the same job with a delay
      await getRenderQueue().add(QUEUE_NAME, { jobId, manifest: manifestRaw }, { jobId: `${jobId}-retry-${retries}`, delay: 5000 * retries });
      logLines.push(`Re-queued (retry ${retries}/${maxRetries})`);
      await setLog(jobId, logLines);
    } else {
      await updateState(jobId, "failed", { errorSummary: `${category}: ${errorMsg}`, retryCount: retries });
    }
    throw err;
  }
}

// Create BullMQ Worker
const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const jobId = job.data.jobId ?? job.id;
    if (!jobId) throw new Error("Missing jobId in render job data");
    await processRenderJob(jobId as string, job.data.manifest ?? job.data);
  },
  {
    connection: redis,
    concurrency: 1, // FFmpeg is CPU-heavy; run one at a time per worker
    limiter: { max: 1, duration: 1000 },
  }
);

worker.on("completed", (job) => {
  console.log(`[worker] completed job ${job.id}`);
});

worker.on("failed", (job, err) => {
  console.error(`[worker] failed job ${job?.id}: ${err.message}`);
});

const healthServer = createServer(async (_req, res) => {
  const checks = {
    worker: !isShuttingDown,
    redis: false,
    database: false,
    storage: getStorageStatus(),
  };

  try {
    checks.redis = (await redis.ping()) === "PONG";
  } catch { }

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch { }

  const ok = checks.worker && checks.redis && checks.database && checks.storage.configured;
  res.writeHead(ok ? 200 : 503, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    ok,
    service: "vionto-worker",
    queue: QUEUE_NAME,
    checks,
    timestamp: new Date().toISOString(),
  }));
});

healthServer.listen(WORKER_HEALTH_PORT, "0.0.0.0", () => {
  console.log(`[worker] health server listening on ${WORKER_HEALTH_PORT}`);
});

console.log(`[worker] Vionto render worker started on queue '${QUEUE_NAME}'`);

// Graceful shutdown
function shutdown(signal: string) {
  console.log(`[worker] ${signal} received. Closingâ€¦`);
  worker.close().then(() => redis.disconnect()).then(() => process.exit(0));
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
