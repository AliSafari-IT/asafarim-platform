import type { ApplicationStatusName } from "./constants";

/**
 * Which audit events one application update should write. Kept apart from
 * service.ts (which is `server-only` and Prisma-backed) so it can be unit
 * tested on its own.
 *
 * A status change is the event an operator actually looks for ("did this
 * candidate get an interview, an offer?"), so it gets its own action with
 * from/to. Everything else collapses into one `application.updated` naming
 * only *which* fields changed — never their values: notes are the
 * candidate's own free text and stay out of the audit trail. A PATCH that
 * changes nothing (the notes field blurs without an edit) writes nothing.
 */

export interface ApplicationAuditState {
  status: ApplicationStatusName;
  notes: string | null;
  followUpDate: Date | null;
  tailoredResumeId: string | null;
}

export interface ApplicationAuditPatch {
  status?: ApplicationStatusName;
  notes?: string | null;
  followUpDate?: Date | null;
  tailoredResumeId?: string | null;
}

export interface ApplicationAuditEvent {
  action: "application.status_changed" | "application.updated";
  metadata: Record<string, string>;
}

function sameDate(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) return a === b;
  return a.getTime() === b.getTime();
}

export function applicationAuditEvents(
  ids: { applicationId: string; targetJobId: string },
  before: ApplicationAuditState,
  patch: ApplicationAuditPatch,
): ApplicationAuditEvent[] {
  const events: ApplicationAuditEvent[] = [];

  if (patch.status !== undefined && patch.status !== before.status) {
    events.push({
      action: "application.status_changed",
      metadata: { ...ids, fromStatus: before.status, toStatus: patch.status },
    });
  }

  const changed: string[] = [];
  if (patch.notes !== undefined && (patch.notes ?? null) !== (before.notes ?? null)) changed.push("notes");
  if (patch.followUpDate !== undefined && !sameDate(patch.followUpDate, before.followUpDate)) {
    changed.push("followUpDate");
  }
  if (patch.tailoredResumeId !== undefined && patch.tailoredResumeId !== before.tailoredResumeId) {
    changed.push("tailoredResumeId");
  }
  if (changed.length > 0) {
    events.push({ action: "application.updated", metadata: { ...ids, changedFields: changed.join(",") } });
  }

  return events;
}
