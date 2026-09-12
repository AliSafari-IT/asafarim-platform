import "server-only";
import { prisma } from "../db";
import { assertAccess, NotFoundError, type ViewerContext } from "../authz";
import { detectTemporalConflicts, TemporalValueSchema } from "../../ai/temporal";

/**
 * Read-only: computes conflicts across a timeline's events with a
 * recorded TemporalValue (TLAI-004). Never mutates anything — this feeds a
 * conflict-review panel, and "leave unresolved" is the default; nothing
 * here auto-applies a fix.
 */
export async function getTemporalConflicts(timelineId: string, viewer: ViewerContext) {
  const timeline = await prisma.timeline.findUnique({ where: { id: timelineId } });
  if (!timeline) throw new NotFoundError("That timeline doesn't exist.");
  assertAccess(timeline, viewer, "edit");

  const events = await prisma.timelineEvent.findMany({
    where: { timelineId },
    select: { id: true, temporalPrecision: true },
  });

  const withValues = events
    .filter((e) => e.temporalPrecision !== null)
    .map((e) => {
      const parsed = TemporalValueSchema.safeParse(e.temporalPrecision);
      return parsed.success ? { id: e.id, value: parsed.data } : null;
    })
    .filter((e): e is { id: string; value: NonNullable<typeof e>["value"] } => e !== null);

  return detectTemporalConflicts(withValues);
}
