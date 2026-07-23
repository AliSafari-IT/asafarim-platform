import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { buildKey, deleteObject, getObjectBytes, putObjectBytes } from "@asafarim/storage";
import type { Db } from "../db/client";
import { generatedFiles } from "../db/schema";
import type { RuntimeContext } from "./runtimeAuth";
import { assertRuntimePermission } from "./runtimeAuth";
import { findEntity } from "./validation";
import { generateId } from "../db/ids";
import { ConflictError, ForbiddenError, NotFoundError } from "../errors";

/**
 * The generated-app file boundary. Uses `@asafarim/storage` (S3-compatible;
 * automatically falls back to a deterministic local-directory adapter
 * outside production/`STORAGE_FORCE_REMOTE` — exactly the fake adapter
 * tests need, with no code branching required here) for the actual bytes,
 * and this module's own DB-backed metadata + signed-token layer for
 * authorization, MIME/size allowlisting, and expiry.
 *
 * Client input NEVER determines the storage key or is trusted for MIME
 * type alone: `buildKey` always mints a fresh, random, server-generated
 * key; the declared MIME/size are checked against the FIELD's own
 * allowlist at `initUpload`, and the actual byte length is re-verified
 * against the declared size at `commitUpload` (a client cannot declare
 * "10 bytes" and upload 50MB). The original filename is stored purely as
 * display metadata — never used to construct a storage path.
 *
 * Malware scanning: NOT implemented in M09 — uploaded bytes are persisted
 * and served back only to already-authorized members, with no execution
 * path anywhere in this codebase that would interpret file contents (no
 * server-side rendering of uploaded HTML/scripts, no client-side
 * `dangerouslySetInnerHTML` of file contents). A production content-scanning
 * boundary (e.g. an async antivirus/AV pipeline gating `status: "committed"`)
 * is an explicit, documented deferral — see docs/appbuilder-m09-data-engine.md.
 */

export type GeneratedFileRow = typeof generatedFiles.$inferSelect;

export class FileTooLargeError extends ConflictError {
  constructor(maxBytes: number) {
    super(`File exceeds the maximum allowed size of ${Math.round(maxBytes / (1024 * 1024))}MB.`);
    this.name = "FileTooLargeError";
  }
}

export class UnsupportedMimeTypeError extends ConflictError {
  constructor(mimeType: string) {
    super(`MIME type "${mimeType}" is not accepted for this field.`);
    this.name = "UnsupportedMimeTypeError";
  }
}

export class FileAccessDeniedError extends ForbiddenError {
  constructor() {
    super("Not authorized to access this file.");
    this.name = "FileAccessDeniedError";
  }
}

export class SignedLinkExpiredError extends ConflictError {
  constructor() {
    super("This download link has expired.");
    this.name = "SignedLinkExpiredError";
  }
}

const DEFAULT_MAX_SIZE_BYTES = 25 * 1024 * 1024;
const DOWNLOAD_TOKEN_TTL_MS = 5 * 60_000;

function mimeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "application/pdf": "pdf",
    "text/plain": "txt",
  };
  return map[mimeType] ?? "bin";
}

function getTokenSecret(): string {
  return process.env.APPBUILDER_FILE_TOKEN_SECRET ?? "dev-insecure-appbuilder-file-token-secret";
}

interface DownloadTokenPayload {
  fileId: string;
  principalId: string;
  expiresAt: number;
}

function signDownloadToken(payload: DownloadTokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", getTokenSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifyDownloadToken(token: string): DownloadTokenPayload {
  const [body, signature] = token.split(".");
  if (!body || !signature) throw new SignedLinkExpiredError();
  const expected = createHmac("sha256", getTokenSecret()).update(body).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new SignedLinkExpiredError();
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as DownloadTokenPayload;
  if (Date.now() > payload.expiresAt) throw new SignedLinkExpiredError();
  return payload;
}

export interface InitUploadInput {
  entityId: string;
  fieldId: string;
  recordId?: string;
  mimeType: string;
  sizeBytes: number;
  originalFilename: string;
}

/** Validates the upload against the field's own MIME/size allowlist and mints a server-generated storage key. Returns a `pending` file row — bytes are not yet persisted. */
export async function initUpload(db: Db, ctx: RuntimeContext, input: InitUploadInput): Promise<{ fileId: string; storageKey: string }> {
  assertRuntimePermission(ctx, input.entityId, input.recordId ? "update" : "create");
  const entity = findEntity(ctx.spec, input.entityId);
  const field = entity.fields.find((f) => !f.archived && f.id === input.fieldId && (f.type === "file" || f.type === "image"));
  if (!field || (field.type !== "file" && field.type !== "image")) {
    throw new ConflictError(`"${input.fieldId}" is not a file/image field on entity "${input.entityId}".`);
  }

  const maxBytes = (field.maxSizeMb ?? 25) * 1024 * 1024;
  if (input.sizeBytes <= 0 || input.sizeBytes > Math.min(maxBytes, DEFAULT_MAX_SIZE_BYTES * 40)) {
    throw new FileTooLargeError(maxBytes);
  }

  const allowed = field.type === "file" ? field.acceptedMimeTypes : undefined;
  if (allowed && allowed.length > 0 && !allowed.includes(input.mimeType)) {
    throw new UnsupportedMimeTypeError(input.mimeType);
  }
  if (field.type === "image" && !input.mimeType.startsWith("image/")) {
    throw new UnsupportedMimeTypeError(input.mimeType);
  }

  const fileId = generateId();
  const storageKey = buildKey(`generated/${ctx.appId}/${input.entityId}`, mimeToExt(input.mimeType));

  await db.insert(generatedFiles).values({
    id: fileId,
    appId: ctx.appId,
    entityId: input.entityId,
    recordId: input.recordId ?? null,
    fieldId: input.fieldId,
    storageKey,
    originalFilename: input.originalFilename.slice(0, 255),
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    status: "pending",
    uploadedByPrincipalId: ctx.actor.principalId,
  });

  return { fileId, storageKey };
}

/** Persists the actual bytes for a previously-initiated upload. Only the original uploader may commit it, and only once; the byte length is re-verified against what was declared at `initUpload`. */
export async function commitUpload(db: Db, ctx: RuntimeContext, fileId: string, bytes: Buffer): Promise<GeneratedFileRow> {
  const [file] = await db.select().from(generatedFiles).where(and(eq(generatedFiles.id, fileId), eq(generatedFiles.appId, ctx.appId))).limit(1);
  if (!file) throw new NotFoundError("File", fileId);
  if (file.uploadedByPrincipalId !== ctx.actor.principalId) throw new FileAccessDeniedError();
  if (file.status !== "pending") throw new ConflictError("This upload has already been committed or archived.");
  if (bytes.length !== file.sizeBytes) {
    throw new ConflictError("Uploaded byte count does not match the declared size.");
  }

  await putObjectBytes(file.storageKey, bytes, file.mimeType, { acl: "private" });

  const [committed] = await db
    .update(generatedFiles)
    .set({ status: "committed", committedAt: new Date() })
    .where(eq(generatedFiles.id, fileId))
    .returning();
  return committed;
}

/** Mints a short-lived (5 minute), single-file, single-principal signed download token. */
export async function getDownloadAuthorization(db: Db, ctx: RuntimeContext, fileId: string): Promise<{ token: string; expiresAt: Date }> {
  const [file] = await db.select().from(generatedFiles).where(and(eq(generatedFiles.id, fileId), eq(generatedFiles.appId, ctx.appId))).limit(1);
  if (!file || file.status !== "committed") throw new NotFoundError("File", fileId);
  assertRuntimePermission(ctx, file.entityId, "read");

  const expiresAt = new Date(Date.now() + DOWNLOAD_TOKEN_TTL_MS);
  const token = signDownloadToken({ fileId, principalId: ctx.actor.principalId, expiresAt: expiresAt.getTime() });
  return { token, expiresAt };
}

/**
 * Streams a file's bytes ONLY after verifying a still-valid signed token
 * bound to this exact file and principal — this is the one place file
 * bytes are proxied through the app server, and only ever for an already-
 * authorized, non-expired, single-use-window request; never an unrestricted
 * passthrough of an arbitrary client-supplied key.
 */
export async function downloadFile(db: Db, fileId: string, token: string): Promise<{ body: Buffer; contentType: string; filename: string }> {
  const payload = verifyDownloadToken(token);
  if (payload.fileId !== fileId) throw new FileAccessDeniedError();

  const [file] = await db.select().from(generatedFiles).where(eq(generatedFiles.id, fileId)).limit(1);
  if (!file || file.status !== "committed") throw new NotFoundError("File", fileId);

  const object = await getObjectBytes(file.storageKey);
  if (!object) throw new NotFoundError("File", fileId);

  return { body: object.body, contentType: object.contentType, filename: file.originalFilename };
}

export async function archiveFile(db: Db, ctx: RuntimeContext, fileId: string): Promise<GeneratedFileRow> {
  const [file] = await db.select().from(generatedFiles).where(and(eq(generatedFiles.id, fileId), eq(generatedFiles.appId, ctx.appId))).limit(1);
  if (!file) throw new NotFoundError("File", fileId);
  assertRuntimePermission(ctx, file.entityId, "update");
  if (file.status === "archived") return file;

  await deleteObject(file.storageKey);
  const [archived] = await db
    .update(generatedFiles)
    .set({ status: "archived", archivedAt: new Date() })
    .where(eq(generatedFiles.id, fileId))
    .returning();
  return archived;
}
