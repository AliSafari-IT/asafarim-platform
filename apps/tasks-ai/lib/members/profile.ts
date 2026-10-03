/**
 * Membership profile snapshot (#759). TasksAI keeps the opaque platform user
 * id as its identity key (ADR 0001) and never reads the platform DB. To show
 * people by name it copies the display name and avatar the Hub session carries
 * onto the member's own membership row: written on join, refreshed whenever a
 * signed-in request sees different values. It is deleted with the membership.
 *
 * Rendering rule: a person is shown by `memberLabel`, never by their platform
 * id. Without a snapshot (the member hasn't signed in since #759) the label is
 * "Member ·" plus a short suffix of the *membership* id: stable, and unrelated
 * to the platform identity.
 */
import type { Prisma, PrismaClient } from "../db/generated";

type Db = PrismaClient | Prisma.TransactionClient;

export interface ProfileSource {
  name?: string | null;
  image?: string | null;
}

const MAX_NAME = 120;
const MAX_URL = 2000;

/** The values to store: trimmed, bounded; an avatar only if it's an http(s) URL. */
export function profileSnapshot(source: ProfileSource): { displayName: string | null; avatarUrl: string | null } {
  const name = source.name?.trim().slice(0, MAX_NAME) || null;
  const image = source.image?.trim() ?? "";
  const avatarUrl = /^https?:\/\//i.test(image) && image.length <= MAX_URL ? image : null;
  return { displayName: name, avatarUrl };
}

/** How a member is shown. Never the platform user id. */
export function memberLabel(member: { id: string; displayName?: string | null }): string {
  const name = member.displayName?.trim();
  if (name) return name;
  return `Member ·${member.id.slice(-4)}`;
}

/**
 * The snapshot fields, emptied. Spread into every update that ends a
 * membership (member removal, SCIM deprovisioning, DSR delete), so personal
 * data never outlives the membership it was copied for.
 */
export const CLEARED_PROFILE = { displayName: null, avatarUrl: null, profileSyncedAt: null } as const;

/**
 * Refresh the snapshot when the session's name or image differs from what is
 * stored. A no-op (no write) when nothing changed, so it's cheap on every
 * signed-in request.
 */
export async function syncMemberProfile(
  db: Db,
  membership: { id: string; displayName?: string | null; avatarUrl?: string | null },
  source: ProfileSource,
): Promise<boolean> {
  const next = profileSnapshot(source);
  if (next.displayName === null && next.avatarUrl === null) return false; // nothing to learn from this session
  if ((membership.displayName ?? null) === next.displayName && (membership.avatarUrl ?? null) === next.avatarUrl) return false;
  await db.membership.update({
    where: { id: membership.id },
    data: { ...next, profileSyncedAt: new Date() },
  });
  return true;
}

/** Where a failed refresh is reported. Only ids and error codes, never names or URLs. */
export interface SyncFailureLog {
  warn(fields: { membershipId: string; error: string }, message: string): void;
}

const MAX_REPORTED = 1000;
const reported = new Set<string>();

/** Name or code of an error, never its message (a database error can echo the values). */
export function errorCode(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { code?: unknown; name?: unknown };
    if (typeof e.code === "string" && e.code) return e.code;
    if (typeof e.name === "string" && e.name) return e.name;
  }
  return "unknown";
}

/**
 * `syncMemberProfile` for the request path: a failure never blocks the request,
 * but it isn't swallowed either. It's logged once per membership per process
 * (so a broken database doesn't flood the log), with the membership id and
 * the error code only.
 */
export async function syncMemberProfileSafely(
  db: Db,
  membership: { id: string; displayName?: string | null; avatarUrl?: string | null },
  source: ProfileSource,
  log: SyncFailureLog,
): Promise<boolean> {
  try {
    return await syncMemberProfile(db, membership, source);
  } catch (error) {
    if (!reported.has(membership.id) && reported.size < MAX_REPORTED) {
      reported.add(membership.id);
      log.warn({ membershipId: membership.id, error: errorCode(error) }, "member profile snapshot refresh failed");
    }
    return false;
  }
}

/** Test hook: forget which memberships were already reported. */
export function resetReportedSyncFailures(): void {
  reported.clear();
}
