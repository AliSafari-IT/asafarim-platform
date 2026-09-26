/**
 * Maps applications, and the status changes recorded against them, onto
 * the activity-entry wire shape that app/api/internal/user-activity (one
 * user) and its /browse sibling (everyone) return to the admin console.
 *
 * Two entry types, because they answer two different questions:
 * - `application`: the application as it stands now (current status). The
 *   User 360 view lists these as the candidate's pipeline.
 * - `application_status_change`: one entry per `application.status_changed`
 *   audit event, stamped with the time it happened. This is what makes
 *   "moved to Interviewing" or "got an Offer" show up in a newest-first
 *   feed; the application row alone only carries its creation time, so a
 *   status change on an old application would otherwise never surface.
 *
 * Only ids, statuses and the job's title/employer are exposed, the same as
 * the tailored-resume and cover-letter entries already are. The
 * candidate's notes never leave ResuMatch.
 */

export interface JobLabel {
  title: string | null;
  employer: string | null;
}

export interface ApplicationRowForActivity {
  id: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  followUpDate: Date | null;
  tailoredResumeId: string | null;
  targetJob: JobLabel;
}

export interface StatusChangeEventForActivity {
  id: string;
  createdAt: Date;
  metadata: unknown;
}

export interface ActivityEntryWire {
  id: string;
  type: "application" | "application_status_change";
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  href: string;
  metadata: Record<string, unknown>;
}

export function jobTitle(job: JobLabel | null | undefined, fallback = "Application"): string {
  if (!job) return fallback;
  return `${job.title ?? fallback}${job.employer ? ` · ${job.employer}` : ""}`;
}

/** "INTERVIEWING" → "interviewing", matching the lower-case status vocabulary the other entries use. */
export function statusLabel(status: string): string {
  return status.toLowerCase();
}

export function applicationEntry(row: ApplicationRowForActivity, base: string): ActivityEntryWire {
  return {
    id: row.id,
    type: "application",
    title: jobTitle(row.targetJob),
    status: statusLabel(row.status),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    href: `${base}/applications`,
    metadata: {
      followUpDate: row.followUpDate?.toISOString() ?? null,
      tailoredResumeId: row.tailoredResumeId,
    },
  };
}

/** The applicationId/fromStatus/toStatus an `application.status_changed` event carries, or null for a malformed row. */
export function parseStatusChange(
  metadata: unknown,
): { applicationId: string; fromStatus: string; toStatus: string } | null {
  if (!metadata || typeof metadata !== "object") return null;
  const { applicationId, fromStatus, toStatus } = metadata as Record<string, unknown>;
  if (typeof applicationId !== "string" || typeof fromStatus !== "string" || typeof toStatus !== "string") {
    return null;
  }
  return { applicationId, fromStatus, toStatus };
}

/**
 * One feed entry per status change. `jobs` maps applicationId to its job
 * label; an application deleted since (its job was removed) still shows,
 * just without a title, since the event itself did happen.
 */
export function statusChangeEntry(
  event: StatusChangeEventForActivity,
  jobs: Map<string, JobLabel>,
  base: string,
): ActivityEntryWire | null {
  const change = parseStatusChange(event.metadata);
  if (!change) return null;
  return {
    id: event.id,
    type: "application_status_change",
    title: `${jobTitle(jobs.get(change.applicationId))}: ${statusLabel(change.fromStatus)} → ${statusLabel(change.toStatus)}`,
    status: statusLabel(change.toStatus),
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.createdAt.toISOString(),
    href: `${base}/applications`,
    metadata: {
      applicationId: change.applicationId,
      fromStatus: change.fromStatus,
      toStatus: change.toStatus,
    },
  };
}

/** Application ids referenced by a batch of status-change events, for one batched job-label lookup. */
export function statusChangeApplicationIds(events: StatusChangeEventForActivity[]): string[] {
  const ids = new Set<string>();
  for (const event of events) {
    const change = parseStatusChange(event.metadata);
    if (change) ids.add(change.applicationId);
  }
  return [...ids];
}
