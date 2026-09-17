import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { deleteObject, getObjectBytes, objectExists, putObjectBytes } from "@asafarim/storage";

/**
 * Private candidate-document storage (JM-017).
 *
 * Three properties this module is responsible for:
 *
 * **Keys are derived, never supplied.** A storage key is
 * `jobmatch/candidate-documents/<workspaceId>/<uuid>.<ext>` and nothing
 * else. The candidate's filename never reaches it, so there is no path to
 * traverse and no key to guess across workspaces. Filename is display-only
 * metadata on the row.
 *
 * **Bytes are served, never linked.** There are no presigned URLs here.
 * The platform's storage helper can mint them, but a presigned URL is a
 * bearer token for a CV that survives in browser history, referrer headers,
 * and chat logs long after the session ends. The document download route
 * checks ownership and streams the bytes through the app instead, which
 * costs a little bandwidth and removes an entire class of leak.
 *
 * **Deletion is real.** `deleteDocumentBytes` removes the object; the
 * caller is responsible for the row and the derived artifacts. JM-023's
 * erasure path depends on both halves happening, which is why it is one
 * function there rather than two call sites.
 */

const KEY_PREFIX = "jobmatch/candidate-documents";

/**
 * Retention for the original upload. Deliberately short: once text is
 * extracted and the candidate has confirmed a profile version, the original
 * document earns its keep only for re-extraction after a parser
 * improvement. 90 days covers that; holding a CV indefinitely does not.
 */
export const DOCUMENT_RETENTION_DAYS = 90;

export function buildDocumentKey(workspaceId: string, extension: string): string {
  // workspaceId is a cuid we generated; extension comes from the sniffer's
  // fixed set. Neither is user text, so neither can shape the path.
  return `${KEY_PREFIX}/${workspaceId}/${randomUUID()}.${extension}`;
}

export function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function retainUntil(from: Date = new Date()): Date {
  const until = new Date(from);
  until.setUTCDate(until.getUTCDate() + DOCUMENT_RETENTION_DAYS);
  return until;
}

export async function putDocumentBytes(
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  // `acl: "private"` is passed explicitly rather than relying on a default:
  // @asafarim/storage defaults to "public-read" for avatars and public
  // media, which is exactly the wrong default for a CV.
  await putObjectBytes(key, Buffer.from(bytes), contentType, { acl: "private" });
}

export async function readDocumentBytes(
  key: string,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  try {
    const object = await getObjectBytes(key);
    if (!object) return null;
    return { bytes: new Uint8Array(object.body), contentType: object.contentType };
  } catch {
    return null;
  }
}

/**
 * Delete stored bytes and *verify* they are gone.
 *
 * `@asafarim/storage`'s `deleteObject` returns void and swallows its own
 * errors — reasonable for an avatar, useless for a CV, because it makes a
 * failed delete indistinguishable from a successful one. An erasure that
 * reports success while the bytes remain is worse than one that reports
 * failure, so this reads the object back and returns whether it actually
 * went away.
 */
export async function deleteDocumentBytes(key: string): Promise<boolean> {
  await deleteObject(key);
  try {
    return !(await objectExists(key));
  } catch {
    // Cannot confirm removal, so do not claim it.
    return false;
  }
}
