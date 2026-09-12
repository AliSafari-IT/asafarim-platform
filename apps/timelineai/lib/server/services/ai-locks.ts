import "server-only";
import { prisma, type Prisma } from "../db";
import { assertAccess, NotFoundError, type ViewerContext } from "../authz";

const TIMELINE_LOCKABLE_FIELDS = ["title", "subtitle", "description"] as const;
type TimelineLockableField = (typeof TIMELINE_LOCKABLE_FIELDS)[number];

async function loadTimelineForEdit(timelineId: string, viewer: ViewerContext) {
  const timeline = await prisma.timeline.findUnique({ where: { id: timelineId } });
  if (!timeline) throw new NotFoundError("That timeline doesn't exist.");
  assertAccess(timeline, viewer, "edit");
  return timeline;
}

/** Replaces the full set of timeline-level fields the narrative copilot must not rewrite. */
export async function setNarrativeLockedFields(
  timelineId: string,
  fields: TimelineLockableField[],
  viewer: ViewerContext
) {
  await loadTimelineForEdit(timelineId, viewer);
  const unique = Array.from(new Set(fields));
  return prisma.timeline.update({
    where: { id: timelineId },
    data: { aiLockedFields: unique as unknown as Prisma.InputJsonValue },
  });
}

export async function setEventNarrativeLock(
  timelineId: string,
  eventId: string,
  locked: boolean,
  viewer: ViewerContext
) {
  await loadTimelineForEdit(timelineId, viewer);
  const event = await prisma.timelineEvent.findUnique({ where: { id: eventId } });
  if (!event || event.timelineId !== timelineId) {
    throw new NotFoundError("That event doesn't exist.");
  }
  return prisma.timelineEvent.update({ where: { id: eventId }, data: { aiLocked: locked } });
}
