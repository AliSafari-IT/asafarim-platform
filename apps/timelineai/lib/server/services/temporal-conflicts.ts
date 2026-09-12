import "server-only";
import { prisma } from "../db";
import { assertAccess, NotFoundError, type ViewerContext } from "../authz";
import { detectTemporalConflicts, TemporalValueSchema, type TemporalValue } from "../../ai/temporal";

export interface ConflictingEvent {
  id: string;
  title: string;
  displayDate: string | null;
  value: TemporalValue;
}

/**
 * Read-only: computes conflicts across a timeline's events with a
 * recorded TemporalValue (TLAI-004). Never mutates anything — this feeds a
 * conflict-review panel, and "leave unresolved" is the default; nothing
 * here auto-applies a fix.
 *
 * `events` in the return value is only the events referenced by at least
 * one conflict (not every dated event), so the panel can show each
 * conflict's evidence — title, displayDate, and precision — without a
 * second round trip, while staying scoped to what's actually in conflict.
 */
export async function getTemporalConflicts(timelineId: string, viewer: ViewerContext) {
  const timeline = await prisma.timeline.findUnique({ where: { id: timelineId } });
  if (!timeline) throw new NotFoundError("That timeline doesn't exist.");
  assertAccess(timeline, viewer, "edit");

  const events = await prisma.timelineEvent.findMany({
    where: { timelineId },
    select: { id: true, title: true, displayDate: true, temporalPrecision: true },
  });

  const withValues = events
    .map((e) => {
      if (e.temporalPrecision === null) return null;
      const parsed = TemporalValueSchema.safeParse(e.temporalPrecision);
      if (!parsed.success) return null;
      return { id: e.id, title: e.title, displayDate: e.displayDate, value: parsed.data };
    })
    .filter((e): e is ConflictingEvent => e !== null);

  const conflicts = detectTemporalConflicts(withValues.map(({ id, value }) => ({ id, value })));

  const conflictEventIds = new Set(conflicts.flatMap((c) => c.eventIds));
  const conflictingEvents = withValues.filter((e) => conflictEventIds.has(e.id));

  return { conflicts, events: conflictingEvents };
}
