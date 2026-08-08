/**
 * Pure ownership/visibility/moderation decision logic — no imports of
 * next-auth, Prisma, or "server-only" so this can be unit-tested directly
 * and reused from both server code and (read-only) client-side UI gating.
 * The server-only viewer identity that feeds this lives in
 * lib/server/authz.ts; never trust a ViewerContext built from client input.
 */

export interface ViewerContext {
  userId: string | null;
  isAdmin: boolean;
  /** Hash of the current request's IP, if resolvable. Guests only. */
  guestIdHash: string | null;
}

export type TimelineAccessAction = "view" | "edit" | "delete" | "moderate";

export interface AccessSubject {
  ownerUserId: string | null;
  guestIdHash: string | null;
  visibility: string;
  moderationStatus: string;
}

export function canAccess(
  timeline: AccessSubject,
  viewer: ViewerContext,
  action: TimelineAccessAction
): boolean {
  // Admins can do everything, including moderate.
  if (viewer.isAdmin) return true;

  const isOwner =
    (timeline.ownerUserId !== null && timeline.ownerUserId === viewer.userId) ||
    (timeline.ownerUserId === null &&
      timeline.guestIdHash !== null &&
      timeline.guestIdHash === viewer.guestIdHash);

  if (action === "moderate") return false; // admin-only, already handled above

  if (action === "edit" || action === "delete") {
    return isOwner;
  }

  // action === "view"
  if (isOwner) return true;

  // Non-owners may only view content that is public/unlisted AND approved
  // (or not subject to moderation, i.e. a self-published authenticated
  // timeline). Guest submissions pending/rejected review are never visible
  // to anyone but their owner and admins — even if visibility got set to
  // "public" client-side, moderationStatus gates it server-side.
  if (timeline.visibility === "private") return false;
  if (timeline.moderationStatus === "pending" || timeline.moderationStatus === "rejected") {
    return false;
  }
  return true;
}
