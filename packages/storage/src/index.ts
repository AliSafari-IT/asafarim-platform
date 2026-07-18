import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Shared object storage layer.
 *
 * Production: S3-compatible (DigitalOcean Spaces, AWS S3, etc.). Configure via:
 *   STORAGE_ENDPOINT, STORAGE_REGION, STORAGE_BUCKET,
 *   STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY, STORAGE_PUBLIC_URL
 *
 * Local dev: falls back to local-file mode unless STORAGE_FORCE_REMOTE=true.
 */

const DEFAULT_LOCAL_DIR = join(process.cwd(), ".local-storage", "objects");

export type StorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  publicUrl: string;
  forceRemote?: boolean;
};

type LocalObject = { body: Buffer; contentType: string };

const localObjects = new Map<string, LocalObject>();

function getLocalStorageDir(): string {
  return process.env.STORAGE_LOCAL_DIR
    ? join(process.env.STORAGE_LOCAL_DIR)
    : DEFAULT_LOCAL_DIR;
}

async function ensureLocalDir(): Promise<void> {
  await mkdir(getLocalStorageDir(), { recursive: true });
}

function getLocalFilePath(key: string): string {
  const safeKey = key.replace(/[^a-zA-Z0-9._-]/g, "_");
  return join(getLocalStorageDir(), safeKey);
}

function getLocalMetaPath(key: string): string {
  return `${getLocalFilePath(key)}.json`;
}

function normalizeEndpoint(endpoint: string, bucket: string): string {
  const trimmed = endpoint.replace(/\/+$/, "");
  try {
    const url = new URL(trimmed);
    const prefix = `${bucket}.`;
    if (url.hostname.startsWith(prefix)) {
      url.hostname = url.hostname.slice(prefix.length);
      return url.toString().replace(/\/+$/, "");
    }
  } catch {
    // ignore
  }
  return trimmed;
}

function readConfig(): StorageConfig | null {
  // Support both generic STORAGE_* and legacy DO_SPACES_* vars used by Vionto.
  const endpoint =
    process.env.STORAGE_ENDPOINT ?? process.env.DO_SPACES_ENDPOINT;
  const region = process.env.STORAGE_REGION ?? process.env.DO_SPACES_REGION;
  const bucket =
    process.env.STORAGE_BUCKET ??
    process.env.DO_SPACES_BUCKET_NAME ??
    process.env.DO_SPACES_BUCKET;
  const accessKey =
    process.env.STORAGE_ACCESS_KEY ??
    process.env.DO_SPACES_ACCESS_KEY_ID ??
    process.env.DO_SPACES_KEY;
  const secretKey =
    process.env.STORAGE_SECRET_KEY ??
    process.env.DO_SPACES_SECRET_ACCESS_KEY ??
    process.env.DO_SPACES_SECRET;
  const publicUrl =
    process.env.STORAGE_PUBLIC_URL ?? process.env.DO_SPACES_PUBLIC_URL;
  const forceRemoteFlag =
    process.env.STORAGE_FORCE_REMOTE ?? process.env.DO_SPACES_FORCE_REMOTE;

  const forceRemote = ["1", "true", "yes", "on"].includes(
    (forceRemoteFlag ?? "").trim().toLowerCase()
  );

  if (!forceRemote && process.env.NODE_ENV !== "production") {
    return null;
  }

  if (!endpoint || !region || !bucket || !accessKey || !secretKey) {
    if (forceRemote) {
      throw new Error(
        "Remote storage requested but endpoint, region, bucket, access key, and secret key are not all set."
      );
    }
    return null;
  }

  const normalizedEndpoint = normalizeEndpoint(endpoint, bucket);
  const resolvedPublicUrl =
    publicUrl ?? `${normalizedEndpoint.replace(/\/+$/, "")}/${bucket}`;

  return {
    endpoint: normalizedEndpoint,
    region,
    bucket,
    accessKey,
    secretKey,
    publicUrl: resolvedPublicUrl,
    forceRemote,
  };
}

let cachedClient: { client: S3Client; config: StorageConfig } | null = null;

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

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const detailed = error as Error & {
      name?: string;
      Code?: string;
      $metadata?: { httpStatusCode?: number; requestId?: string };
    };
    return [
      detailed.name || "StorageError",
      detailed.Code,
      error.message,
      detailed.$metadata?.httpStatusCode
        ? `status=${detailed.$metadata.httpStatusCode}`
        : null,
      detailed.$metadata?.requestId
        ? `requestId=${detailed.$metadata.requestId}`
        : null,
    ]
      .filter(Boolean)
      .join(" ");
  }
  return String(error);
}

async function putLocalObject(
  key: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  await ensureLocalDir();
  const filePath = getLocalFilePath(key);
  await writeFile(filePath, body);
  await writeFile(
    getLocalMetaPath(key),
    JSON.stringify({ key, contentType, sizeBytes: body.length }, null, 2)
  );
  localObjects.set(key, { body, contentType });
  return `/api/storage/local?key=${encodeURIComponent(key)}`;
}

/** Persist raw bytes to remote storage (or local fallback) and return a public URL. */
export async function putObjectBytes(
  key: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  const handle = getClient();
  if (!handle) {
    return putLocalObject(key, body, contentType);
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
    throw new Error(`Storage upload failed: ${describeError(error)}`);
  }

  return `${handle.config.publicUrl.replace(/\/+$/, "")}/${key}`;
}

/** Delete an object from remote or local storage. */
export async function deleteObject(key: string): Promise<void> {
  const handle = getClient();
  if (!handle) {
    localObjects.delete(key);
    try {
      await unlink(getLocalFilePath(key));
      await unlink(getLocalMetaPath(key));
    } catch {
      // ignore — may not exist
    }
    return;
  }

  try {
    await handle.client.send(
      new DeleteObjectCommand({ Bucket: handle.config.bucket, Key: key })
    );
  } catch {
    // ignore — may not exist
  }
}

/** Confirm an object exists in remote or local storage. */
export async function objectExists(key: string): Promise<boolean> {
  const handle = getClient();
  if (!handle) {
    if (localObjects.has(key)) return true;
    try {
      await readFile(getLocalFilePath(key));
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

/** Compute the public URL for a given storage key. */
export function getPublicUrlForKey(key: string): string {
  const handle = getClient();
  if (!handle) {
    return `/api/storage/local?key=${encodeURIComponent(key)}`;
  }
  return `${handle.config.publicUrl.replace(/\/+$/, "")}/${key}`;
}

/** Generate a unique storage key under a prefix. */
export function buildKey(prefix: string, extension: string): string {
  const ext = extension.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "bin";
  return `${prefix.replace(/\/+$/, "")}/${randomUUID()}.${ext}`;
}

/** Runtime status for health checks. */
export function getStorageStatus() {
  const handle = getClient();
  return {
    configured: Boolean(handle),
    remote: Boolean(handle),
    bucket: handle?.config.bucket,
    region: handle?.config.region,
    endpoint: handle?.config.endpoint,
    publicUrl: handle?.config.publicUrl,
  };
}
