import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  writeFile,
  readFile,
  unlink,
  readdir,
  stat,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { MAX_IMAGE_BYTES, type AllowedUploadMime } from "./validation";

/**
 * Vionto storage layer.
 *
 * Production: S3-compatible (DigitalOcean Spaces). Configure via env:
 *   DO_SPACES_ENDPOINT, DO_SPACES_REGION, DO_SPACES_BUCKET,
 *   DO_SPACES_KEY, DO_SPACES_SECRET, DO_SPACES_PUBLIC_URL (optional)
 *
 * Local dev: defaults to local-file mode unless VIONTO_STORAGE_DRIVER=spaces
 * is set. If any required Spaces var is missing, the helper also short-circuits
 * into local mode. Set VIONTO_STORAGE_DRIVER=local to force local behavior.
 */

const PRESIGN_EXPIRES_SEC = 10 * 60; // 10 minutes

export type PresignedUpload = {
  key: string;
  uploadUrl: string;
  publicUrl: string;
  headers: Record<string, string>;
  expiresInSec: number;
  isLocalStub: boolean;
};

export type PresignInput = {
  userId: string;
  filename: string;
  contentType: AllowedUploadMime;
  sizeBytes: number;
  sessionId: string;
  category?: StorageCategory;
};

export type StorageCategory =
  "originals" | "thumbnails" | "audio" | "renders" | "exports" | "sessions";

export type LocalObject = {
  body: Buffer;
  contentType: string;
};

const globalForStorage = globalThis as typeof globalThis & {
  __viontoLocalObjects?: Map<string, LocalObject>;
};

const localObjects =
  globalForStorage.__viontoLocalObjects ?? new Map<string, LocalObject>();
globalForStorage.__viontoLocalObjects = localObjects;

function getLocalStorageDir(): string {
  if (process.env.VIONTO_LOCAL_STORAGE_DIR)
    return process.env.VIONTO_LOCAL_STORAGE_DIR;
  const appDir = join(process.cwd(), "apps", "vionto");
  return existsSync(appDir)
    ? join(appDir, ".local-storage", "uploads")
    : join(process.cwd(), ".local-storage", "uploads");
}

async function ensureLocalStorageDir(): Promise<void> {
  try {
    await mkdir(getLocalStorageDir(), { recursive: true });
  } catch (error) {
    // Directory might already exist
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      console.error(
        "[storage] Failed to create local storage directory:",
        error
      );
    }
  }
}

function getLocalFilePath(key: string): string {
  const safeKey = key.replace(/[^a-zA-Z0-9._-]/g, "_");
  return join(getLocalStorageDir(), safeKey);
}

function getLocalMetaPath(key: string): string {
  return `${getLocalFilePath(key)}.json`;
}

function describeStorageError(error: unknown): string {
  if (error instanceof Error) {
    const details = error as Error & {
      name?: string;
      Code?: string;
      $metadata?: {
        httpStatusCode?: number;
        requestId?: string;
        extendedRequestId?: string;
      };
    };
    const status = details.$metadata?.httpStatusCode;
    const requestId = details.$metadata?.requestId;
    return [
      details.name || "StorageError",
      details.Code,
      error.message,
      status ? `status=${status}` : null,
      requestId ? `requestId=${requestId}` : null,
    ]
      .filter(Boolean)
      .join(" ");
  }
  return String(error);
}

type StorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  publicUrl: string;
};

function normalizeSpacesEndpoint(endpoint: string, bucket: string): string {
  const trimmed = endpoint.replace(/\/+$/, "");
  try {
    const url = new URL(trimmed);
    const bucketPrefix = `${bucket}.`;
    if (url.hostname.startsWith(bucketPrefix)) {
      url.hostname = url.hostname.slice(bucketPrefix.length);
      return url.toString().replace(/\/+$/, "");
    }
  } catch {
    // Fall through to the original value. S3Client will surface invalid URLs.
  }
  return trimmed;
}

function readConfig(): StorageConfig | null {
  const {
    VIONTO_STORAGE_DRIVER,
    DO_SPACES_ENDPOINT,
    DO_SPACES_REGION,
    DO_SPACES_BUCKET,
    DO_SPACES_KEY,
    DO_SPACES_SECRET,
    DO_SPACES_PUBLIC_URL,
  } = process.env;

  const driver = VIONTO_STORAGE_DRIVER?.toLowerCase();

  if (driver === "local") {
    return null;
  }

  if (
    process.env.NODE_ENV !== "production" &&
    driver !== "spaces" &&
    driver !== "s3"
  ) {
    return null;
  }

  if (
    !DO_SPACES_ENDPOINT ||
    !DO_SPACES_REGION ||
    !DO_SPACES_BUCKET ||
    !DO_SPACES_KEY ||
    !DO_SPACES_SECRET
  ) {
    return null;
  }

  const endpoint = normalizeSpacesEndpoint(
    DO_SPACES_ENDPOINT,
    DO_SPACES_BUCKET
  );
  let endpointUrl: URL;
  try {
    endpointUrl = new URL(endpoint);
  } catch {
    // Invalid URL format, fall back to simple concatenation
    return {
      endpoint,
      region: DO_SPACES_REGION,
      bucket: DO_SPACES_BUCKET,
      accessKey: DO_SPACES_KEY,
      secretKey: DO_SPACES_SECRET,
      publicUrl:
        DO_SPACES_PUBLIC_URL ??
        `${endpoint.replace(/\/+$/, "")}/${DO_SPACES_BUCKET}`,
    };
  }

  return {
    endpoint,
    region: DO_SPACES_REGION,
    bucket: DO_SPACES_BUCKET,
    accessKey: DO_SPACES_KEY,
    secretKey: DO_SPACES_SECRET,
    publicUrl:
      DO_SPACES_PUBLIC_URL ??
      `${endpointUrl.protocol}//${DO_SPACES_BUCKET}.${endpointUrl.hostname}`,
  };
}

let cachedClient: { client: S3Client; config: StorageConfig } | null = null;

export function getStorageStatus(): {
  configured: boolean;
  bucket?: string;
  region?: string;
  endpoint?: string;
  publicUrl?: string;
} {
  const config = readConfig();
  if (!config) return { configured: false };
  return {
    configured: true,
    bucket: config.bucket,
    region: config.region,
    endpoint: config.endpoint,
    publicUrl: config.publicUrl,
  };
}

function getClient(): { client: S3Client; config: StorageConfig } | null {
  if (cachedClient) return cachedClient;
  const config = readConfig();
  if (!config) return null;

  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
    forcePathStyle: false,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  cachedClient = { client, config };
  return cachedClient;
}

/**
 * Build a canonical object key. Never embed raw emails or unsafe filenames.
 * Structure: vionto/{userId}/{category}/{sessionId|projectId}/{uuid}/{safeName}
 */
export function buildKey(
  userId: string,
  category: StorageCategory,
  scopeId: string, // sessionId or projectId
  filename: string
): string {
  const safe =
    filename
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/\.{2,}/g, "_")
      .replace(/^[._-]+/, "")
      .slice(0, 80) || "file";
  return `vionto/${userId}/${category}/${scopeId}/${randomUUID()}/${safe}`;
}

/** Verify that a key was issued for the given user. */
export function isKeyOwnedBy(key: string, userId: string): boolean {
  return key.startsWith(`vionto/${userId}/`);
}

/** Extract session or project scope from a well-formed key. */
export function getKeyScope(key: string): string | null {
  const parts = key.split("/");
  return parts.length >= 5 ? parts[4] : null;
}

function getLocalUploadUrl(key: string): string {
  return `/api/uploads/local?key=${encodeURIComponent(key)}`;
}

export async function putLocalObject(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  await ensureLocalStorageDir();
  const filePath = getLocalFilePath(key);
  await writeFile(filePath, body);
  await writeFile(
    getLocalMetaPath(key),
    JSON.stringify({ key, contentType, sizeBytes: body.length }, null, 2)
  );
  // Also keep in memory for faster access
  localObjects.set(key, { body, contentType });
}

export async function getLocalObject(key: string): Promise<LocalObject | null> {
  // Try memory first
  const mem = localObjects.get(key);
  if (mem) return mem;

  // Try disk
  try {
    const filePath = getLocalFilePath(key);
    const body = await readFile(filePath);
    let contentType = "application/octet-stream";
    try {
      const meta = JSON.parse(
        await readFile(getLocalMetaPath(key), "utf8")
      ) as { contentType?: string };
      contentType = meta.contentType ?? contentType;
    } catch {
      // Older local uploads may not have metadata.
    }
    const obj = { body, contentType };
    // Cache in memory
    localObjects.set(key, obj);
    return obj;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    console.error("[storage] Failed to read local object:", error);
    return null;
  }
}

export async function putObjectBytes(
  key: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  const handle = getClient();
  if (!handle) {
    await putLocalObject(key, body, contentType);
    return getLocalUploadUrl(key);
  }

  try {
    await handle.client.send(
      new PutObjectCommand({
        Bucket: handle.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentLength: body.length,
      })
    );
  } catch (error) {
    throw new Error(`Storage upload failed: ${describeStorageError(error)}`);
  }

  return `${handle.config.publicUrl.replace(/\/+$/, "")}/${key}`;
}

export async function createPresignedUploadUrl(
  input: PresignInput
): Promise<PresignedUpload> {
  if (input.sizeBytes > MAX_IMAGE_BYTES) {
    throw new Error(`File exceeds ${MAX_IMAGE_BYTES} bytes`);
  }

  const key = buildKey(
    input.userId,
    input.category ?? "sessions",
    input.sessionId,
    input.filename
  );
  const headers: Record<string, string> = { "Content-Type": input.contentType };

  const handle = getClient();
  if (!handle) {
    const localUrl = getLocalUploadUrl(key);
    return {
      key,
      uploadUrl: localUrl,
      publicUrl: localUrl,
      headers,
      expiresInSec: PRESIGN_EXPIRES_SEC,
      isLocalStub: true,
    };
  }

  const command = new PutObjectCommand({
    Bucket: handle.config.bucket,
    Key: key,
    ContentType: input.contentType,
    ContentLength: input.sizeBytes,
  });

  const uploadUrl = await getSignedUrl(handle.client, command, {
    expiresIn: PRESIGN_EXPIRES_SEC,
  });

  return {
    key,
    uploadUrl,
    publicUrl: `${handle.config.publicUrl.replace(/\/+$/, "")}/${key}`,
    headers,
    expiresInSec: PRESIGN_EXPIRES_SEC,
    isLocalStub: false,
  };
}

/** Confirm an object exists in storage before persisting metadata. */
export async function objectExists(key: string): Promise<boolean> {
  const handle = getClient();
  if (!handle) {
    const mem = localObjects.get(key);
    if (mem) return true;
    try {
      const filePath = getLocalFilePath(key);
      await readFile(filePath);
      return true;
    } catch {
      return false;
    }
  }
  try {
    await handle.client.send(
      new HeadObjectCommand({ Bucket: handle.config.bucket, Key: key })
    );
    return true;
  } catch {
    return false;
  }
}

/** Delete an object from storage. */
export async function deleteObject(key: string): Promise<void> {
  const handle = getClient();
  if (!handle) {
    localObjects.delete(key);
    try {
      const filePath = getLocalFilePath(key);
      await unlink(filePath);
      await unlink(getLocalMetaPath(key));
    } catch {
      // ignore — already gone or never existed
    }
    return;
  }
  try {
    await handle.client.send(
      new DeleteObjectCommand({ Bucket: handle.config.bucket, Key: key })
    );
  } catch {
    // ignore — already gone or never existed
  }
}

/**
 * Build the public URL for a storage key based on current configuration.
 * Returns a `local-stub://` URL in stub mode so callers can still persist the key.
 */
export function getPublicUrlForKey(key: string): string {
  const handle = getClient();
  if (!handle) return getLocalUploadUrl(key);
  return `${handle.config.publicUrl.replace(/\/+$/, "")}/${key}`;
}

/**
 * Maximum bytes fetched for server-side metadata extraction (EXIF headers).
 */
export const MAX_METADATA_FETCH_BYTES = 2 * 1024 * 1024; // 2 MB is enough for JPEG/PNG headers + EXIF

/**
 * Fetch object bytes from storage for server-side metadata extraction.
 * Returns null in stub mode or if the object is missing / unreadable.
 */
export async function getObjectBytes(
  key: string,
  maxBytes: number = MAX_METADATA_FETCH_BYTES
): Promise<Buffer | null> {
  const handle = getClient();
  if (!handle) {
    const mem = localObjects.get(key);
    if (mem) return mem.body.subarray(0, maxBytes);
    try {
      const filePath = getLocalFilePath(key);
      const body = await readFile(filePath);
      return body.subarray(0, maxBytes);
    } catch {
      return null;
    }
  }
  try {
    const response = await handle.client.send(
      new GetObjectCommand({
        Bucket: handle.config.bucket,
        Key: key,
        Range: `bytes=0-${Math.max(0, maxBytes - 1)}`,
      })
    );
    const body = response.Body as unknown as
      AsyncIterable<Uint8Array> | undefined;
    if (!body) return null;
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of body) {
      const buf = Buffer.from(chunk);
      chunks.push(buf);
      total += buf.length;
      if (total >= maxBytes) break;
    }
    return Buffer.concat(chunks, Math.min(total, maxBytes));
  } catch {
    return null;
  }
}

/**
 * Download an object from storage to a local file path.
 * Used by the worker to materialize assets before FFmpeg processing.
 */
export async function downloadObjectToLocalFile(
  key: string,
  localPath: string
): Promise<void> {
  const handle = getClient();
  if (!handle) {
    const mem = localObjects.get(key);
    if (mem) {
      await writeFile(localPath, mem.body);
      return;
    }
    try {
      const filePath = getLocalFilePath(key);
      const body = await readFile(filePath);
      await writeFile(localPath, body);
      return;
    } catch (error) {
      throw new Error(`Failed to read local object ${key}: ${error}`);
    }
  }
  try {
    const response = await handle.client.send(
      new GetObjectCommand({
        Bucket: handle.config.bucket,
        Key: key,
      })
    );
    const body = response.Body as unknown as
      AsyncIterable<Uint8Array> | undefined;
    if (!body) {
      throw new Error(`Object ${key} not found in storage`);
    }
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.from(chunk));
    }
    await writeFile(localPath, Buffer.concat(chunks));
  } catch (error) {
    throw new Error(`Failed to download object ${key} from storage: ${error}`);
  }
}

/**
 * Upload a local file to storage and return the public URL.
 * Used by the worker to upload the final MP4.
 */
export async function uploadLocalFileToStorage(
  localPath: string,
  key: string,
  contentType: string
): Promise<string> {
  const body = await readFile(localPath);
  await putObjectBytes(key, body, contentType);
  return getPublicUrlForKey(key);
}

const MUSIC_LIBRARY_MAX_KEYS = 200;
const AUDIO_FILE_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".ogg",
  ".m4a",
  ".webm",
  ".aac",
  ".flac",
]);

export type AudioLibraryItem = {
  key: string;
  filename: string;
  publicUrl: string;
  lastModified: string;
  sizeBytes: number;
  category?: string;
  common?: boolean; // true when the track is from the shared/common library
};

function extractCommonAudioCategory(key: string): string | undefined {
  const parts = key.split("/");
  const audioIndex = parts.findIndex((part) => part === "audio");
  return audioIndex >= 0 ? parts[audioIndex + 2] || undefined : undefined;
}

function isAudioKey(key: string): boolean {
  const ext = (key.split(".").pop() ?? "").toLowerCase();
  return AUDIO_FILE_EXTENSIONS.has(`.${ext}`);
}

function extractFilenameFromKey(key: string): string {
  const lastSlash = key.lastIndexOf("/");
  return lastSlash >= 0 ? key.slice(lastSlash + 1) : key;
}

/**
 * List audio objects owned by a user from the configured storage backend.
 * Searches the user's prefix (`vionto/{userId}/`) and returns audio files only.
 */
export async function listUserMusic(
  userId: string,
  maxKeys: number = MUSIC_LIBRARY_MAX_KEYS
): Promise<AudioLibraryItem[]> {
  const handle = getClient();
  if (!handle) {
    return listLocalUserMusic(userId);
  }

  const prefix = `vionto/${userId}/`;
  const items: AudioLibraryItem[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await handle.client.send(
      new ListObjectsV2Command({
        Bucket: handle.config.bucket,
        Prefix: prefix,
        MaxKeys: Math.min(maxKeys, 1000),
        ContinuationToken: continuationToken,
      })
    );

    for (const object of response.Contents ?? []) {
      const key = object.Key;
      if (!key || !isAudioKey(key)) continue;
      items.push({
        key,
        filename: extractFilenameFromKey(key),
        publicUrl: `${handle.config.publicUrl.replace(/\/+$/, "")}/${key}`,
        lastModified:
          object.LastModified?.toISOString() ?? new Date().toISOString(),
        sizeBytes: object.Size ?? 0,
      });
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken && items.length < maxKeys);

  return items.sort(
    (a, b) =>
      new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
  );
}

async function listLocalUserMusic(userId: string): Promise<AudioLibraryItem[]> {
  const dir = getLocalStorageDir();
  if (!existsSync(dir)) return [];

  const entries = await readdir(dir, { withFileTypes: true });
  const metaFiles = entries.filter(
    (e) => e.isFile() && e.name.endsWith(".json")
  );
  const items: AudioLibraryItem[] = [];

  for (const metaFile of metaFiles) {
    try {
      const metaPath = join(dir, metaFile.name);
      const raw = await readFile(metaPath, "utf8");
      const meta = JSON.parse(raw) as {
        key?: string;
        contentType?: string;
        sizeBytes?: number;
      };
      const key = meta.key;
      if (!key || !key.startsWith(`vionto/${userId}/`) || !isAudioKey(key))
        continue;
      const filePath = join(dir, metaFile.name.replace(/\.json$/, ""));
      const fileStat = await stat(filePath).catch(() => null);
      if (!fileStat) continue;
      items.push({
        key,
        filename: extractFilenameFromKey(key),
        publicUrl: getLocalUploadUrl(key),
        lastModified: fileStat.mtime.toISOString(),
        sizeBytes: fileStat.size,
      });
    } catch {
      // Skip unreadable metadata files
    }
  }

  return items.sort(
    (a, b) =>
      new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
  );
}

/**
 * List shared/common audio objects available to every user.
 * Common tracks are stored under `vionto/common/` and intentionally skip
 * ownership checks so all users can preview and select them.
 */
export async function listCommonMusic(
  maxKeys: number = MUSIC_LIBRARY_MAX_KEYS
): Promise<AudioLibraryItem[]> {
  const handle = getClient();
  if (!handle) {
    return listLocalCommonMusic();
  }

  const prefix = "vionto/common/";
  const items: AudioLibraryItem[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await handle.client.send(
      new ListObjectsV2Command({
        Bucket: handle.config.bucket,
        Prefix: prefix,
        MaxKeys: Math.min(maxKeys, 1000),
        ContinuationToken: continuationToken,
      })
    );

    for (const object of response.Contents ?? []) {
      const key = object.Key;
      if (!key || (!isAudioKey(key) && !key.startsWith("vionto/common/audio/")))
        continue;
      items.push({
        key,
        filename: extractFilenameFromKey(key),
        publicUrl: `${handle.config.publicUrl.replace(/\/+$/, "")}/${key}`,
        lastModified:
          object.LastModified?.toISOString() ?? new Date().toISOString(),
        sizeBytes: object.Size ?? 0,
        category: extractCommonAudioCategory(key),
        common: true,
      });
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken && items.length < maxKeys);

  return items.sort(
    (a, b) =>
      new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
  );
}

async function listLocalCommonMusic(): Promise<AudioLibraryItem[]> {
  const baseDir = getLocalStorageDir();
  const dir = join(baseDir, "vionto", "common");
  if (!existsSync(dir)) return [];

  const entries = await readdir(dir, { withFileTypes: true });
  const metaFiles = entries.filter(
    (e) => e.isFile() && e.name.endsWith(".json")
  );
  const items: AudioLibraryItem[] = [];

  for (const metaFile of metaFiles) {
    try {
      const metaPath = join(dir, metaFile.name);
      const raw = await readFile(metaPath, "utf8");
      const meta = JSON.parse(raw) as {
        key?: string;
        contentType?: string;
        sizeBytes?: number;
      };
      const key = meta.key;
      if (!key || !key.startsWith("vionto/common/") || !isAudioKey(key))
        continue;
      const filePath = join(dir, metaFile.name.replace(/\.json$/, ""));
      const fileStat = await stat(filePath).catch(() => null);
      if (!fileStat) continue;
      items.push({
        key,
        filename: extractFilenameFromKey(key),
        publicUrl: getLocalUploadUrl(key),
        lastModified: fileStat.mtime.toISOString(),
        sizeBytes: fileStat.size,
        category: extractCommonAudioCategory(key),
        common: true,
      });
    } catch {
      // Skip unreadable metadata files
    }
  }

  return items.sort(
    (a, b) =>
      new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
  );
}

/**
 * Generate a presigned GET URL for downloading an object.
 * Used by the download endpoint to provide time-limited access.
 */
export async function createPresignedDownloadUrl(
  key: string,
  expiresInSec: number = 15 * 60
): Promise<string> {
  const handle = getClient();
  if (!handle) {
    return getLocalUploadUrl(key);
  }
  try {
    const command = new GetObjectCommand({
      Bucket: handle.config.bucket,
      Key: key,
    });
    return await getSignedUrl(handle.client, command, {
      expiresIn: expiresInSec,
    });
  } catch (error) {
    throw new Error(
      `Failed to create presigned download URL for ${key}: ${error}`
    );
  }
}
