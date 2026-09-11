/**
 * One display-ready row of a user's footprint in a single app. Adapters
 * translate their app's raw records into this shape so the User 360 explorer
 * never needs to learn another app's schema.
 */
export interface ActivityEntry {
  /** Stable id, unique within the source app (e.g. the row's Prisma id). */
  id: string;
  /** Source app slug, matching the platform app registry (e.g. "vionto"). */
  app: string;
  /** Coarse kind of record, e.g. "project", "render_job", "export", "timeline". */
  type: string;
  title: string;
  /** Short human status, e.g. "completed", "failed", "published". Free text — apps use their own vocab. */
  status: string;
  createdAt: Date;
  updatedAt: Date;
  /** Absolute or app-relative URL back into the source app for this record. */
  href: string | null;
  /** App-specific extra fields for the detail view (duration, resolution, error, ...). */
  metadata: Record<string, unknown>;
}

/** A per-app section of a user's activity, plus whether the app could be reached at all. */
export interface ActivitySection {
  app: string;
  /** False when the app has no adapter wired up yet — distinct from an adapter that ran and found nothing. */
  supported: boolean;
  /** False when the adapter ran but could not be reached / errored — distinct from a genuinely empty result. */
  available: boolean;
  error?: string;
  entries: ActivityEntry[];
  /** Free-form per-app summary stats (e.g. storage usage) shown above the entry list. */
  summary?: Record<string, unknown>;
}

export interface ActivityLookup {
  /** Platform user id. */
  userId: string;
  /** Fallback key for apps that key activity by email rather than platform id. */
  email?: string | null;
}

/** Who created/owns a platform-wide activity entry — there is no single "the user" to key by, unlike ActivityLookup. */
export interface ActivityOwner {
  userId: string;
  email: string | null;
  name: string | null;
}

/** One entry in the cross-user "platform activity" browse view, with its owner attached. */
export interface PlatformActivityEntry extends ActivityEntry {
  owner: ActivityOwner;
}

export interface ListAllOptions {
  /** Max entries to return. */
  limit: number;
  /** Opaque cursor from a previous ListAllResult.nextCursor — omit for the first page. */
  cursor?: string | null;
}

export interface ListAllResult {
  entries: PlatformActivityEntry[];
  /** Pass back as `cursor` to fetch the next page; null when this was the last page. */
  nextCursor: string | null;
}

/**
 * Contract every per-app activity adapter implements. Read-only: an adapter
 * must never mutate data. Must never throw — network/DB failures are
 * reported via ActivitySection.available = false, so one app being down
 * never blanks the whole User 360 view.
 */
export interface UserActivityAdapter {
  /** Platform app slug this adapter serves, matching the app registry. */
  readonly app: string;
  getActivity(lookup: ActivityLookup): Promise<ActivitySection>;
  /**
   * Optional: browse this app's flagship content across EVERY user, newest
   * first, for the superadmin platform-activity view — distinct from
   * getActivity, which is scoped to one user. Adapters that don't implement
   * this are simply absent from that view, not shown as broken (same
   * "no adapter yet" principle as the User 360 explorer).
   */
  listAll?(options: ListAllOptions): Promise<ListAllResult>;
}
