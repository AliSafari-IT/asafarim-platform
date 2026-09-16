import "server-only";
import type { PrismaClient } from "../db/generated";
import type { RequestContext } from "../context";
import type { Actor } from "../authz";
import { dailyBrief } from "./service";
import { assertNoSurveillance } from "./guard";
import { getAiSettings } from "../ai/settings";
import { runAiJob } from "../ai/job";
import { notifyMany } from "../services/notifications";

/**
 * Proactive daily brief delivery (issue #242).
 *
 * A worker-driven push counterpart to `GET /w/{slug}/brief` (pull-only,
 * lib/intel/service.ts). Composes the exact same deterministic M08 brief
 * via `dailyBrief()` — same anti-surveillance guard, same rule versions —
 * and, when the workspace has AI enabled, best-effort-attaches a short
 * narrative over what the member's signals look like right now ("changed
 * digest"). AI failing or being disabled never blocks the deterministic
 * brief: the two paths are independent, and only the AI step is wrapped in
 * try/catch.
 *
 * No BullMQ repeatable-job/cron precedent existed in worker/ at the time
 * this was written (worker/index.ts only has plain `setInterval` timers —
 * see the heartbeat, outbox drainer, and webhook drainer). This module is
 * driven by the same pattern: `runBriefDeliverySweep` is called on an
 * interval from worker/index.ts, and does its own per-member "is it their
 * local morning" check rather than scheduling one BullMQ job per member.
 */

/** Local-morning window: [6:00, 10:00) in the member's own timezone. */
const MORNING_START_HOUR = 6;
const MORNING_END_HOUR = 10;

export interface BriefDeliveryResult {
  membershipId: string;
  delivered: boolean;
  reason:
    | "delivered"
    | "opted_out"
    | "not_morning"
    | "quiet_hours"
    | "already_viewed_today"
    | "already_delivered_today";
}

/** The member's local wall-clock hour, minute and calendar-date key. */
function localParts(now: Date, timeZone: string): { hour: number; minute: number; dateKey: string } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
    const hour = Number(get("hour")) % 24;
    const minute = Number(get("minute"));
    const dateKey = `${get("year")}-${get("month")}-${get("day")}`;
    return { hour, minute, dateKey };
  } catch {
    // An invalid/unknown IANA zone falls back to UTC rather than crashing
    // the sweep for every other member.
    return localParts(now, "UTC");
  }
}

export function isLocalMorning(now: Date, timeZone: string): boolean {
  const { hour } = localParts(now, timeZone);
  return hour >= MORNING_START_HOUR && hour < MORNING_END_HOUR;
}

/** Parses the existing "HH:MM-HH:MM" quiet-hours format, wraps past midnight. */
export function isInQuietHours(now: Date, timeZone: string, quietHours: string | null): boolean {
  if (!quietHours) return false;
  const m = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(quietHours);
  if (!m) return false;
  const [, sh, sm, eh, em] = m;
  const startMin = Number(sh) * 60 + Number(sm);
  const endMin = Number(eh) * 60 + Number(em);
  const { hour, minute } = localParts(now, timeZone);
  const nowMin = hour * 60 + minute;
  if (startMin === endMin) return false;
  if (startMin < endMin) return nowMin >= startMin && nowMin < endMin;
  // Wraps midnight, e.g. "22:00-07:00".
  return nowMin >= startMin || nowMin < endMin;
}

/** Did this member already pull `GET /brief` today (their local day)? */
async function alreadyViewedToday(
  db: PrismaClient,
  workspaceId: string,
  membershipId: string,
  timeZone: string,
  now: Date,
): Promise<boolean> {
  const { dateKey } = localParts(now, timeZone);
  const dayStartUtc = new Date(`${dateKey}T00:00:00.000Z`);
  // Cheap over-inclusive lower bound (local midnight can differ from UTC by
  // up to ~14h); the exact per-event local-date comparison happens below.
  const lowerBound = new Date(dayStartUtc.getTime() - 24 * 60 * 60 * 1000);
  const events = await db.auditEvent.findMany({
    where: {
      workspaceId,
      actorId: membershipId,
      name: "brief.viewed",
      occurredAt: { gte: lowerBound },
    },
    select: { occurredAt: true },
  });
  return events.some((e) => localParts(e.occurredAt, timeZone).dateKey === dateKey);
}

function buildActor(role: Actor["role"], membershipId: string, platformUserId: string): Actor {
  return { membershipId, platformUserId, role };
}

/**
 * Composes and, if eligible, pushes today's brief for one member. Exported
 * separately from the sweep so tests can exercise a single member without
 * seeding a full eligible-population scan.
 */
export async function deliverBriefToMember(
  db: PrismaClient,
  workspaceId: string,
  membershipId: string,
  now: Date = new Date(),
): Promise<BriefDeliveryResult> {
  const [membership, pref] = await Promise.all([
    db.membership.findUnique({ where: { id: membershipId } }),
    db.notificationPreference.findUnique({ where: { membershipId } }),
  ]);
  if (!membership || membership.archivedAt || membership.workspaceId !== workspaceId) {
    return { membershipId, delivered: false, reason: "not_morning" };
  }
  // Defense in depth: runBriefDeliverySweep only queries briefDelivery=true
  // rows, but this function is also called directly (tests, and any future
  // manual-trigger surface), so the opt-in gate is re-checked here too. No
  // preference row at all means the member never opted in — off by default.
  if (!pref?.briefDelivery) {
    return { membershipId, delivered: false, reason: "opted_out" };
  }
  const timezone = pref.timezone;

  if (!isLocalMorning(now, timezone)) {
    return { membershipId, delivered: false, reason: "not_morning" };
  }
  if (isInQuietHours(now, timezone, pref.quietHours)) {
    return { membershipId, delivered: false, reason: "quiet_hours" };
  }
  if (await alreadyViewedToday(db, workspaceId, membershipId, timezone, now)) {
    return { membershipId, delivered: false, reason: "already_viewed_today" };
  }

  const ctx: RequestContext = {
    db,
    workspaceId,
    workspaceSlug: "", // unused by dailyBrief/runAiJob; avoids an extra lookup
    actor: buildActor(membership.role, membership.id, membership.platformUserId),
    correlationId: `brief-delivery:${membershipId}:${now.toISOString()}`,
  };

  // 1) The deterministic M08 brief — the exact same function and guard the
  //    pull endpoint uses. Never skipped by an AI failure/disablement.
  const brief = await dailyBrief(ctx);

  // 2) Optional, additive AI narrative ("changed digest"). Reuses the
  //    existing `summarize` AI kind rather than adding a new one: its
  //    prompt already asks for a prose `summary` with operations left
  //    empty unless the text names an explicit new action item, which is
  //    exactly the shape a short digest narrative needs. It goes through
  //    the full pipeline (runAiJob → redact → prompt → provider → guard →
  //    Proposal row) like every other kind — nothing is bypassed for it.
  //    Best-effort: the kill switch, quota, or a provider error all just
  //    mean no narrative, never a failed delivery.
  let narrative: string | null = null;
  try {
    const settings = await getAiSettings(ctx);
    if (settings.enabled) {
      const input = describeForNarrative(brief);
      const { proposal } = await runAiJob(ctx, { kind: "summarize", input });
      if (proposal.summary) {
        assertNoSurveillance({ narrative: proposal.summary });
        narrative = proposal.summary;
      }
    }
  } catch {
    // AI off, quota/budget exhausted, provider error, or the narrative
    // itself tripped the surveillance guard — the deterministic brief
    // below still goes out.
    narrative = null;
  }

  const dateKey = localParts(now, timezone).dateKey;
  const created = await db.$transaction((tx) =>
    notifyMany(tx, workspaceId, `worker:brief-delivery`, [
      {
        recipientId: membershipId,
        kind: "daily_brief",
        data: { brief, narrative },
        dedupeKey: `daily_brief:${membershipId}:${dateKey}`,
      },
    ]),
  );

  return {
    membershipId,
    delivered: created > 0,
    reason: created > 0 ? "delivered" : "already_delivered_today",
  };
}

/** Untrusted-free, work-shaped prose for the `summarize` prompt's input. */
function describeForNarrative(brief: Awaited<ReturnType<typeof dailyBrief>>): string {
  const lines = [
    `Today's top focus items (${brief.topFocus.length}):`,
    ...brief.topFocus.map((f) => `- ${f.task.title}`),
    "",
    `Signals touching your work (${brief.signalsForYou.length}):`,
    ...brief.signalsForYou.map((s) => `- ${s.type}: ${s.evidence.length} item(s)`),
  ];
  return lines.join("\n");
}

/**
 * Sweeps every opted-in member across every workspace and delivers to the
 * ones whose local morning it currently is. Intended to be called on a
 * short interval (e.g. every 15 minutes) from worker/index.ts, matching
 * the setInterval-based scheduling every other worker/ job already uses —
 * there was no BullMQ repeatable/cron precedent in this app to follow.
 */
export async function runBriefDeliverySweep(
  db: PrismaClient,
  now: Date = new Date(),
): Promise<BriefDeliveryResult[]> {
  const opted = await db.notificationPreference.findMany({
    where: { briefDelivery: true },
    select: { membershipId: true },
  });
  const results: BriefDeliveryResult[] = [];
  for (const { membershipId } of opted) {
    const membership = await db.membership.findUnique({
      where: { id: membershipId },
      select: { workspaceId: true, archivedAt: true },
    });
    if (!membership || membership.archivedAt) continue;
    try {
      results.push(await deliverBriefToMember(db, membership.workspaceId, membershipId, now));
    } catch (err) {
      // One member's failure (e.g. an empty/archived workspace mid-sweep)
      // must not stop the rest of the sweep.
      results.push({ membershipId, delivered: false, reason: "not_morning" });
      void err;
    }
  }
  return results;
}
