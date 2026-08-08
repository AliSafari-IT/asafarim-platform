import "server-only";
import { getSession, hasRole, ROLES } from "@asafarim/auth";
import type { Session } from "next-auth";
import { getGuestIdHash } from "./guest";
import {
  canAccess,
  type AccessSubject,
  type TimelineAccessAction,
  type ViewerContext,
} from "../access-rules";

export type { ViewerContext, TimelineAccessAction, AccessSubject };
export { canAccess };

export async function getViewerContext(): Promise<ViewerContext> {
  const session: Session | null = await getSession();
  const userId = session?.user?.id && session.user.isActive !== false ? session.user.id : null;
  const isAdmin = hasRole(session, ROLES.ADMIN);

  // Authenticated users don't need a guest hash; skip the header/HMAC work.
  const guestIdHash = userId ? null : await getGuestIdHash();

  return { userId, isAdmin, guestIdHash };
}

export function assertAccess(
  timeline: AccessSubject,
  viewer: ViewerContext,
  action: TimelineAccessAction
): void {
  if (!canAccess(timeline, viewer, action)) {
    throw new ForbiddenError(`Not authorized to ${action} this timeline.`);
  }
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  readonly status = 404;
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}
