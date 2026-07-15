/**
 * Bulk-upload music from a local folder to the shared/common DO Spaces library.
 *
 * Usage:
 *   pnpm --filter vionto populate-music-library
 *
 * Requirements:
 *   - VIONTO_STORAGE_DRIVER=spaces (or set via env)
 *   - DO_SPACES_* credentials in the environment (loaded from any .env by dotenv,
 *     or already set in your shell/session)
 *
 * The tracks end up under `vionto/common/audio/immostoryai/` and are available
 * to every user in the Vionto music selector. User-uploaded tracks continue to
 * be stored under `vionto/{userId}/audio/` and remain private to that user.
 *
 * Folder structure under the local directory is preserved as S3 prefixes, so
 * `immostoryai/Epic/hero.mp3` becomes `vionto/common/audio/immostoryai/Epic/{uuid}/hero.mp3`.
 *
 * Options:
 *   --dir       optional  Local folder to scan (default: C:\Users\saal\Music\immostoryai)
 *   --scope     optional  Storage scope/key bucket name (default: immostoryai)
 *   --watch     optional  Keep running and upload new files that appear
 *   --dryRun    optional  List what would be uploaded without touching storage
 *   --test      optional  Verify storage credentials and list the target prefix
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, resolve, dirname, basename } from "node:path";
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { putObjectBytes, deleteObject, getStorageStatus } from "../lib/server/storage";

const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".m4a", ".webm", ".aac", ".flac"]);

function inferContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "ogg":
      return "audio/ogg";
    case "m4a":
    case "mp4":
      return "audio/mp4";
    case "webm":
      return "audio/webm";
    case "aac":
      return "audio/aac";
    case "flac":
      return "audio/flac";
    default:
      return "audio/mpeg";
  }
}

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path);
    } else if (entry.isFile()) {
      yield path;
    }
  }
}

async function collectAudioFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  for await (const file of walk(dir)) {
    const ext = file.split(".").pop()?.toLowerCase();
    if (ext && AUDIO_EXTENSIONS.has(`.${ext}`)) {
      files.push(file);
    }
  }
  return files;
}

function safePathSegment(value: string): string {
  return value
    .replace(/[\\/]+/g, "_")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/\.{2,}/g, "_")
    .replace(/^[._-]+/, "")
    .slice(0, 80) || "misc";
}

function safeFilename(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/\.{2,}/g, "_")
    .replace(/^[._-]+/, "")
    .slice(0, 80) || "file";
}

function makeCommonKey(scope: string, rootDir: string, filePath: string): string {
  const rel = relative(rootDir, filePath);
  const relDir = dirname(rel);
  const category = relDir === "." ? "misc" : safePathSegment(relDir);
  const filename = safeFilename(basename(rel));
  return `vionto/common/audio/${scope}/${category}/${randomUUID()}/${filename}`;
}

async function uploadFile(scope: string, rootDir: string, filePath: string) {
  const key = makeCommonKey(scope, rootDir, filePath);
  const body = await readFile(filePath);
  const publicUrl = await putObjectBytes(key, body, inferContentType(filePath));
  return { key, publicUrl };
}

async function testStorageConnection(scope: string): Promise<boolean> {
  const testKey = `vionto/common/audio/${scope}/.connectivity-test-${randomUUID()}`;
  const testBody = Buffer.from("ok");
  try {
    await putObjectBytes(testKey, testBody, "text/plain");
    await deleteObject(testKey);
    console.log("✓ Storage credentials are valid. Test upload/delete succeeded.");
    return true;
  } catch (error) {
    console.error("✗ Storage credentials test failed.");
    console.error(error instanceof Error ? error.message : error);
    return false;
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      dir: { type: "string", default: "C:\\Users\\saal\\Music\\immostoryai" },
      scope: { type: "string", default: "immostoryai" },
      watch: { type: "boolean", default: false },
      dryRun: { type: "boolean", default: false },
      test: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  const scope = values.scope as string;
  const dir = resolve(values.dir as string);
  const watch = values.watch as boolean;
  const dryRun = values.dryRun as boolean;
  const test = values.test as boolean;

  const status = getStorageStatus();
  if (!status.configured) {
    console.error("Storage is not configured for Spaces.");
    console.error("  Set VIONTO_STORAGE_DRIVER=spaces and provide DO_SPACES_* credentials.");
    process.exit(1);
  }
  console.log(`Storage: ${status.publicUrl} (bucket: ${status.bucket})`);
  console.log(`Target prefix: vionto/common/audio/${scope}/`);
  console.log("This will make the tracks available to every Vionto user.");

  if (test || !dryRun) {
    const ok = await testStorageConnection(scope);
    if (!ok) {
      console.error("\nAborting because the storage credential test failed.");
      console.error("Check DO_SPACES_KEY, DO_SPACES_SECRET, DO_SPACES_ENDPOINT, and DO_SPACES_REGION in your environment.");
      process.exit(1);
    }
  }

  if (test) {
    console.log("\nCredential test passed. Run without --test to upload.");
    process.exit(0);
  }

  try {
    await stat(dir);
  } catch {
    console.error(`Directory not found: ${dir}`);
    process.exit(1);
  }

  const files = await collectAudioFiles(dir);
  console.log(`Found ${files.length} audio file(s) in ${dir}`);

  if (dryRun) {
    for (const file of files) {
      console.log(`[dry-run] ${file} -> ${makeCommonKey(scope, dir, file)}`);
    }
    process.exit(0);
  }

  let uploaded = 0;
  let failed = 0;
  for (const file of files) {
    try {
      const { key, publicUrl } = await uploadFile(scope, dir, file);
      console.log(`✓ ${file} -> ${key}`);
      console.log(`  ${publicUrl}`);
      uploaded++;
    } catch (error) {
      console.error(`✗ ${file}`);
      console.error(error instanceof Error ? error.message : error);
      failed++;
    }
  }
  console.log(`\nUploaded ${uploaded}/${files.length} file(s). Failed: ${failed}`);

  if (watch) {
    console.log(`\nWatching ${dir} for new audio files. Press Ctrl+C to stop.`);
    const fs = await import("node:fs");
    fs.watch(dir, { recursive: true }, async (eventType, filename) => {
      if (!filename) return;
      const filePath = join(dir, filename);
      const ext = filePath.split(".").pop()?.toLowerCase();
      if (!ext || !AUDIO_EXTENSIONS.has(`.${ext}`)) return;
      try {
        const s = await stat(filePath);
        if (!s.isFile()) return;
      } catch {
        return;
      }
      console.log(`\nDetected new file: ${filePath}`);
      try {
        const { key, publicUrl } = await uploadFile(scope, dir, filePath);
        console.log(`✓ ${filePath} -> ${key}`);
        console.log(`  ${publicUrl}`);
      } catch (error) {
        console.error(`✗ ${filePath}`);
        console.error(error instanceof Error ? error.message : error);
      }
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
