import "server-only";
import { randomUUID } from "node:crypto";
import { getJobmatchDb } from "../db/client";
import {
  deleteDocumentBytes,
  hashBytes,
  putDocumentBytes,
  readDocumentBytes,
} from "../documents/storage";
import { logError } from "../observability/logger";
import { recordAuditEvent } from "../workspace";
import {
  photoSrc,
  sanitizePhotoJpeg,
  type PhotoRejection,
  type PhotoShape,
} from "./photo";

/**
 * Storage and persistence for the optional CV photo (see ./photo.ts).
 *
 * The same rules as candidate documents (lib/documents/storage.ts): the key
 * is derived from the workspace id and a random UUID, never from anything
 * the browser sent; the object is private; bytes are streamed through an
 * authenticated route, never linked; and a delete is verified, not assumed.
 */

const KEY_PREFIX = "resumatch/profile-photos";

export function buildPhotoKey(workspaceId: string): string {
  return `${KEY_PREFIX}/${workspaceId}/${randomUUID()}.jpg`;
}

export interface ProfilePhotoRow {
  contentHash: string;
  pixelSize: number;
  byteSize: number;
  shape: PhotoShape;
  includeByDefault: boolean;
  updatedAt: Date;
}

const ROW_SELECT = {
  contentHash: true,
  pixelSize: true,
  byteSize: true,
  shape: true,
  includeByDefault: true,
  updatedAt: true,
} as const;

/** What the browser is told about the photo: never the storage key. */
export interface PhotoSummary {
  src: string;
  shape: PhotoShape;
  includeByDefault: boolean;
  pixelSize: number;
  byteSize: number;
}

export function describePhoto(photo: ProfilePhotoRow): PhotoSummary {
  return {
    src: photoSrc(photo.contentHash),
    shape: photo.shape,
    includeByDefault: photo.includeByDefault,
    pixelSize: photo.pixelSize,
    byteSize: photo.byteSize,
  };
}

export async function getProfilePhoto(
  workspaceId: string
): Promise<ProfilePhotoRow | null> {
  const row = await getJobmatchDb().profilePhoto.findUnique({
    where: { workspaceId },
    select: ROW_SELECT,
  });
  return row
    ? { ...row, shape: row.shape === "square" ? "square" : "circle" }
    : null;
}

export async function readProfilePhotoBytes(
  workspaceId: string
): Promise<Uint8Array | null> {
  const row = await getJobmatchDb().profilePhoto.findUnique({
    where: { workspaceId },
    select: { storageKey: true },
  });
  if (!row) return null;
  const stored = await readDocumentBytes(row.storageKey);
  return stored?.bytes ?? null;
}

export type SavePhotoResult =
  { ok: true; photo: ProfilePhotoRow } | { ok: false; reason: PhotoRejection };

/**
 * Store a new photo, replacing any previous one.
 *
 * The new object is written and the row pointed at it before the old object
 * is removed, so a failure part-way never leaves the CV pointing at nothing.
 *
 * The row is switched with a compare-and-swap on the storage key, retried
 * a few times, so two saves (or a save and a delete) racing from two tabs
 * can't strand an object: only the save whose swap succeeded deletes the
 * key it actually replaced, and a save that never wins deletes its own
 * object. A failed delete of the old object is logged (it is unreachable
 * from the app either way: no row names it).
 */
export async function saveProfilePhoto(
  workspaceId: string,
  upload: Uint8Array
): Promise<SavePhotoResult> {
  const sanitized = sanitizePhotoJpeg(upload);
  if (!sanitized.ok) return sanitized;

  const db = getJobmatchDb();
  const storageKey = buildPhotoKey(workspaceId);
  await putDocumentBytes(storageKey, sanitized.bytes, "image/jpeg");

  const data = {
    storageKey,
    contentType: "image/jpeg",
    byteSize: sanitized.bytes.length,
    pixelSize: sanitized.pixels,
    contentHash: hashBytes(sanitized.bytes),
  };

  let replacedKey: string | null = null;
  let swapped = false;
  try {
    for (let attempt = 0; attempt < 5 && !swapped; attempt += 1) {
      const previous = await db.profilePhoto.findUnique({
        where: { workspaceId },
        select: { storageKey: true },
      });
      if (!previous) {
        try {
          // A first photo is shown on new CVs by default: the candidate
          // added it to use it. They can turn that off, and each CV has
          // its own switch.
          await db.profilePhoto.create({ data: { workspaceId, ...data } });
          swapped = true;
        } catch (error) {
          if (!isUniqueViolation(error)) throw error; // another save created it first
        }
      } else {
        const updated = await db.profilePhoto.updateMany({
          where: { workspaceId, storageKey: previous.storageKey },
          data,
        });
        if (updated.count === 1) {
          swapped = true;
          replacedKey = previous.storageKey;
        }
      }
    }
    if (!swapped) throw new Error("ProfilePhotoSwapContended");
  } catch (error) {
    // No row names the new object, so it is the orphan.
    await deleteDocumentBytes(storageKey).catch(() => false);
    throw error;
  }

  if (replacedKey) {
    const removed = await deleteDocumentBytes(replacedKey).catch(() => false);
    if (!removed)
      logError(
        "profile.photo.old_object_delete_failed",
        new Error("ObjectStillPresent")
      );
  }

  await recordAuditEvent(
    workspaceId,
    replacedKey ? "profile.photo.replaced" : "profile.photo.added"
  );
  // Read back by workspace: if a later save already replaced this one,
  // the candidate sees the photo that is actually stored.
  const row = await db.profilePhoto.findUnique({
    where: { workspaceId },
    select: ROW_SELECT,
  });
  if (!row) throw new Error("ProfilePhotoVanished");
  return {
    ok: true,
    photo: { ...row, shape: row.shape === "square" ? "square" : "circle" },
  };
}

export async function updateProfilePhotoSettings(
  workspaceId: string,
  settings: { shape?: PhotoShape; includeByDefault?: boolean }
): Promise<ProfilePhotoRow | null> {
  const db = getJobmatchDb();
  const updated = await db.profilePhoto.updateMany({
    where: { workspaceId },
    data: settings,
  });
  if (updated.count === 0) return null;
  return getProfilePhoto(workspaceId);
}

/**
 * Remove the photo. The row goes only once the object is confirmed gone,
 * so "deleted" is never reported while the bytes remain. The row is
 * deleted only if it still names the object just removed: when another
 * tab replaced the photo meanwhile, the new photo (and its bytes) stay and
 * this reports "failed", which is true — a photo is still stored. Returns
 * "missing" when there was no photo.
 */
export async function deleteProfilePhoto(
  workspaceId: string
): Promise<"deleted" | "missing" | "failed"> {
  const db = getJobmatchDb();
  const row = await db.profilePhoto.findUnique({
    where: { workspaceId },
    select: { id: true, storageKey: true },
  });
  if (!row) return "missing";
  const removed = await deleteDocumentBytes(row.storageKey).catch(() => false);
  if (!removed) {
    logError("profile.photo.delete_failed", new Error("ObjectStillPresent"));
    return "failed";
  }
  const deleted = await db.profilePhoto.deleteMany({
    where: { id: row.id, storageKey: row.storageKey },
  });
  if (deleted.count === 0) return "failed";
  await recordAuditEvent(workspaceId, "profile.photo.deleted");
  return "deleted";
}

/** Prisma's unique-constraint error, by code (as lib/workspace.ts does). */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
