/**
 * Feedback-triage SLA maths (docs: M13). Pure so it is unit-tested without
 * a database. Severity → response-window hours, and a helper to classify an
 * item's SLA state.
 */
export const SLA_HOURS = { blocker: 4, major: 48, minor: 168, idea: 720 } as const;
export type Severity = keyof typeof SLA_HOURS;

export function respondByFor(severity: Severity, createdAt: Date): Date {
  return new Date(createdAt.getTime() + SLA_HOURS[severity] * 3600_000);
}

export type SlaState = "on_track" | "due_soon" | "overdue" | "met";

export function slaState(
  item: { severity: Severity; createdAt: Date; respondBy: Date; respondedAt: Date | null },
  now: Date = new Date(),
): SlaState {
  if (item.respondedAt) return item.respondedAt <= item.respondBy ? "met" : "overdue";
  const msLeft = item.respondBy.getTime() - now.getTime();
  if (msLeft < 0) return "overdue";
  const window = SLA_HOURS[item.severity] * 3600_000;
  return msLeft < window * 0.25 ? "due_soon" : "on_track";
}

/** Roll a set of items into an SLA compliance summary. */
export function slaSummary(
  items: { severity: Severity; createdAt: Date; respondBy: Date; respondedAt: Date | null }[],
  now: Date = new Date(),
) {
  const counts: Record<SlaState, number> = { on_track: 0, due_soon: 0, overdue: 0, met: 0 };
  for (const i of items) counts[slaState(i, now)] += 1;
  const closed = counts.met + counts.overdue;
  return { ...counts, complianceRate: closed ? Number((counts.met / closed).toFixed(2)) : null };
}
