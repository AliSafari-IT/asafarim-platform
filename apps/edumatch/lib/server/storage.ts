import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { AVATAR_MAX_BYTES, MAX_FILE_BYTES, type AllowedMime, type AvatarMime } from "./validation";

/**
 * Phase 2.1 storage layer.
 *
 * Production: S3-compatible (DigitalOcean Spaces). Configure via env:
 *   DO_SPACES_ENDPOINT, DO_SPACES_REGION, DO_SPACES_BUCKET, DO_SPACES_KEY, DO_SPACES_SECRET
 *   DO_SPACES_PUBLIC_URL (optional — defaults to `${endpoint}/${bucket}`)
 *
 * Local dev: if any required var is missing the helper short-circuits into a
 * stub mode that returns a non-functional URL but the rest of the inquiry
 * pipeline still works end-to-end. This keeps the dev loop offline-friendly.
 *
 * Spatial / signed-URL caveats: presigned PUT URLs are scoped to a single key
 * + content-type. The client *must* echo the same `Content-Type` header on
 * the actual PUT, otherwise S3 rejects the signature. We surface that as part
 * of the response so the client can't get it wrong.
 */

const PRESIGN_EXPIRES_SEC = 5 * 60; // 5 minutes
const DOWNLOAD_EXPIRES_SEC = 15 * 60; // 15 minutes — short-lived read access

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
  contentType: AllowedMime;
  sizeBytes: number;
};

type StorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  publicUrl: string;
};

function readConfig(): StorageConfig | null {
  const {
    DO_SPACES_ENDPOINT,
    DO_SPACES_REGION,
    DO_SPACES_BUCKET,
    DO_SPACES_ACCESS_KEY,
    DO_SPACES_KEY,
    DO_SPACES_SECRET,
    DO_SPACES_PUBLIC_URL,
  } = process.env;

  const accessKey = DO_SPACES_ACCESS_KEY || DO_SPACES_KEY;

  if (
    !DO_SPACES_ENDPOINT ||
    !DO_SPACES_REGION ||
    !DO_SPACES_BUCKET ||
    !accessKey ||
    !DO_SPACES_SECRET
  ) {
    return null;
  }

  // The S3 SDK needs the *regional* endpoint (no bucket) and then derives the
  // bucket host itself (virtual-hosted addressing). But operators commonly set
  // DO_SPACES_ENDPOINT to the bucket-scoped URL (e.g.
  // https://my-bucket.fra1.digitaloceanspaces.com). Normalize both forms:
  // strip a leading "<bucket>." label so we never double it.
  const url = new URL(DO_SPACES_ENDPOINT);
  if (url.hostname.startsWith(`${DO_SPACES_BUCKET}.`)) {
    url.hostname = url.hostname.slice(DO_SPACES_BUCKET.length + 1);
  }
  const regionalEndpoint = `${url.protocol}//${url.hostname}`;
  const virtualHostedBase = `${url.protocol}//${DO_SPACES_BUCKET}.${url.hostname}`;

  return {
    endpoint: regionalEndpoint,
    region: DO_SPACES_REGION,
    bucket: DO_SPACES_BUCKET,
    accessKey: accessKey!,
    secretKey: DO_SPACES_SECRET,
    publicUrl: DO_SPACES_PUBLIC_URL ?? virtualHostedBase,
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
  });

  cachedClient = { client, config };
  return cachedClient;
}

/**
 * Build the canonical object key for an inquiry attachment.
 * Including the userId in the path lets us enforce ownership on later reads
 * without round-tripping the database.
 */
export function buildAttachmentKey(userId: string, filename: string): string {
  const safe = filename
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/\.{2,}/g, "_") // collapse "..", "..." etc. so the key can't look like a parent ref
    .replace(/^[._-]+/, "") // strip leading separators
    .slice(0, 80) || "file";
  return `inquiries/${userId}/${randomUUID()}/${safe}`;
}

/**
 * Verify that a key was issued for the given user. Cheap string check, but
 * it's the security boundary that stops user A from claiming user B's
 * upload as their own attachment.
 */
export function isKeyOwnedBy(key: string, userId: string): boolean {
  return key.startsWith(`inquiries/${userId}/`);
}

/**
 * Avatar uploads get their own key prefix (`avatars/{userId}/...`) rather
 * than reusing `inquiries/...`, so the two purposes can never be confused by
 * `isAvatarKeyOwnedBy`/`isKeyOwnedBy` checking each other's namespace.
 */
export function buildAvatarKey(userId: string, filename: string): string {
  const safe = filename
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/\.{2,}/g, "_")
    .replace(/^[._-]+/, "")
    .slice(0, 80) || "avatar";
  return `avatars/${userId}/${randomUUID()}/${safe}`;
}

export function isAvatarKeyOwnedBy(key: string, userId: string): boolean {
  return key.startsWith(`avatars/${userId}/`);
}

/** Public URL for an already-uploaded avatar object, local-stub aware. */
export function buildPublicAvatarUrl(key: string): string {
  const handle = getClient();
  if (!handle) return `local-stub://${key}`;
  return `${handle.config.publicUrl.replace(/\/$/, "")}/${key}`;
}

export async function createPresignedUploadUrl(
  input: PresignInput,
): Promise<PresignedUpload> {
  if (input.sizeBytes > MAX_FILE_BYTES) {
    throw new Error(`File exceeds ${MAX_FILE_BYTES} bytes`);
  }

  const key = buildAttachmentKey(input.userId, input.filename);
  const headers = { "Content-Type": input.contentType };

  const handle = getClient();
  if (!handle) {
    // Local-dev stub: surface a non-functional URL so the rest of the pipeline
    // can still be exercised end-to-end against an in-memory description.
    return {
      key,
      uploadUrl: `local-stub://${key}`,
      publicUrl: `local-stub://${key}`,
      headers,
      expiresInSec: PRESIGN_EXPIRES_SEC,
      isLocalStub: true,
    };
  }

  const command = new PutObjectCommand({
    Bucket: handle.config.bucket,
    Key: key,
    ContentType: input.contentType,
  });

  const uploadUrl = await getSignedUrl(handle.client, command, {
    expiresIn: PRESIGN_EXPIRES_SEC,
  });

  return {
    key,
    uploadUrl,
    publicUrl: `${handle.config.publicUrl.replace(/\/$/, "")}/${key}`,
    headers,
    expiresInSec: PRESIGN_EXPIRES_SEC,
    isLocalStub: false,
  };
}

export type AvatarPresignInput = {
  userId: string;
  filename: string;
  contentType: AvatarMime;
  sizeBytes: number;
};

/**
 * Presign an avatar upload. Deliberately separate from
 * `createPresignedUploadUrl` (different key namespace, tighter size/MIME
 * limits) but shares the same client/config plumbing.
 */
export async function createPresignedAvatarUploadUrl(
  input: AvatarPresignInput,
): Promise<PresignedUpload> {
  if (input.sizeBytes > AVATAR_MAX_BYTES) {
    throw new Error(`File exceeds ${AVATAR_MAX_BYTES} bytes`);
  }

  const key = buildAvatarKey(input.userId, input.filename);
  const headers = { "Content-Type": input.contentType };

  const handle = getClient();
  if (!handle) {
    return {
      key,
      uploadUrl: `local-stub://${key}`,
      publicUrl: `local-stub://${key}`,
      headers,
      expiresInSec: PRESIGN_EXPIRES_SEC,
      isLocalStub: true,
    };
  }

  const command = new PutObjectCommand({
    Bucket: handle.config.bucket,
    Key: key,
    ContentType: input.contentType,
  });

  const uploadUrl = await getSignedUrl(handle.client, command, {
    expiresIn: PRESIGN_EXPIRES_SEC,
  });

  return {
    key,
    uploadUrl,
    publicUrl: `${handle.config.publicUrl.replace(/\/$/, "")}/${key}`,
    headers,
    expiresInSec: PRESIGN_EXPIRES_SEC,
    isLocalStub: false,
  };
}

/**
 * Upload a buffer directly to storage using the S3 SDK — no presigned URL
 * round-trip needed. Used by the server-side proxy upload route so the
 * browser never makes a cross-origin PUT request.
 */
export async function directUpload(
  userId: string,
  filename: string,
  contentType: AllowedMime,
  data: ArrayBuffer,
): Promise<{ key: string; publicUrl: string; isLocalStub: boolean }> {
  if (data.byteLength > MAX_FILE_BYTES) {
    throw new Error(`File exceeds ${MAX_FILE_BYTES} bytes`);
  }

  const key = buildAttachmentKey(userId, filename);
  const handle = getClient();

  if (!handle) {
    return { key, publicUrl: `local-stub://${key}`, isLocalStub: true };
  }

  await handle.client.send(
    new PutObjectCommand({
      Bucket: handle.config.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: data.byteLength,
      Body: Buffer.from(data),
    }),
  );

  return {
    key,
    publicUrl: `${handle.config.publicUrl.replace(/\/$/, "")}/${key}`,
    isLocalStub: false,
  };
}

/**
 * A safe, display-ready attachment view. The storage `key` is intentionally
 * absent — only a freshly-signed, short-lived URL plus display metadata.
 */
export type AttachmentView = {
  url: string;
  mime: string;
  filename: string;
  sizeBytes: number;
};

/**
 * Issue a short-lived presigned GET URL for a stored object. The bucket stays
 * private; callers receive a URL that expires in DOWNLOAD_EXPIRES_SEC. In
 * local-dev stub mode we echo the stub URL.
 */
export async function getSignedDownloadUrl(key: string): Promise<string> {
  const handle = getClient();
  if (!handle) return `local-stub://${key}`;

  const command = new GetObjectCommand({
    Bucket: handle.config.bucket,
    Key: key,
  });
  return getSignedUrl(handle.client, command, {
    expiresIn: DOWNLOAD_EXPIRES_SEC,
  });
}

/**
 * Coerce an inquiry's `attachments` JSON column into display-ready views,
 * replacing the stored URL with a freshly-signed, expiring download URL
 * derived from the object key. Tolerates legacy/empty values. Entries without
 * a usable key fall back to any stored `url` (legacy public objects).
 */
export async function signAttachments(raw: unknown): Promise<AttachmentView[]> {
  if (!Array.isArray(raw)) return [];

  const views = await Promise.all(
    raw.map(async (item): Promise<AttachmentView | null> => {
      if (typeof item !== "object" || item === null) return null;
      const a = item as Record<string, unknown>;
      if (
        typeof a.mime !== "string" ||
        typeof a.filename !== "string" ||
        typeof a.sizeBytes !== "number"
      ) {
        return null;
      }

      let url: string | null = null;
      if (typeof a.key === "string" && a.key.length > 0) {
        url = await getSignedDownloadUrl(a.key);
      } else if (typeof a.url === "string") {
        url = a.url; // legacy object without a stored key
      }
      if (!url) return null;

      return { url, mime: a.mime, filename: a.filename, sizeBytes: a.sizeBytes };
    }),
  );

  return views.filter((v): v is AttachmentView => v !== null);
}

/**
 * Confirm an object actually exists in storage before persisting an
 * attachment record. In stub mode we skip the check and trust the client.
 */
export async function objectExists(key: string): Promise<boolean> {
  const handle = getClient();
  if (!handle) return true;
  try {
    await handle.client.send(
      new HeadObjectCommand({ Bucket: handle.config.bucket, Key: key }),
    );
    return true;
  } catch {
    return false;
  }
}
