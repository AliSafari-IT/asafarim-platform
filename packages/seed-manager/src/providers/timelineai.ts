// TimelineAI provider — demo example timelines on the shared Prisma database.
//
// Ownership is provable: every demo timeline is pinned to
// `seed-timeline-<publicId>` and the demo author to a fixed id/email. Removal
// only ever touches rows matching those exact keys, and the shared User row
// is retained whenever it owns anything the seed did not create.

import { definitionChecksum } from "../checksums";
import type {
  SeedEntityCounts,
  SeedIssue,
  SeedPlan,
  SeedPlanChange,
  SeedProvider,
  SeedProviderContext,
  SeedResult,
  SeedStatus,
  ValidationResult,
} from "../contracts";
import { requiredEnvVars } from "../environments";
import { sanitizeError } from "../redaction";
import { withPrisma, type SeedPrismaClient } from "../prisma-client";
import { buildPlan, unavailableStatus } from "./platform-foundation";
import {
  TIMELINEAI_DEFINITIONS,
  TIMELINEAI_DEFINITION_VERSION,
  TIMELINEAI_DEMOS,
  TIMELINEAI_DEMO_AUTHOR_EMAIL,
  TIMELINEAI_DEMO_AUTHOR_ID,
  timelineSeedId,
  type DemoTimelineInput,
} from "../definitions/timelineai";

const PROVIDER_ID = "timelineai";
const DEFINITION_CHECKSUM = definitionChecksum(TIMELINEAI_DEFINITIONS);
const DEFINITION = {
  version: TIMELINEAI_DEFINITION_VERSION,
  checksum: DEFINITION_CHECKSUM,
};

const KEY_AUTHOR = "timelineai.demo-author";
const KEY_TIMELINES = "timelineai.timelines";
const KEY_EVENTS = "timelineai.events";

/** Every id this seed claims ownership of. The allowlist for deletion. */
const SEED_TIMELINE_IDS = TIMELINEAI_DEMOS.map((demo) => timelineSeedId(demo.publicId));

// ─── Validation ──────────────────────────────────────────────────────────

export function validateTimelineaiDefinitions(): SeedIssue[] {
  const issues: SeedIssue[] = [];
  const seen = new Set<string>();

  for (const demo of TIMELINEAI_DEMOS) {
    if (seen.has(demo.publicId)) {
      issues.push({
        code: "DUPLICATE_PUBLIC_ID",
        severity: "error",
        seedKey: KEY_TIMELINES,
        message: `Timeline publicId "${demo.publicId}" is defined more than once.`,
      });
    }
    seen.add(demo.publicId);

    if (demo.events.length === 0) {
      issues.push({
        code: "EMPTY_TIMELINE",
        severity: "warning",
        seedKey: KEY_EVENTS,
        message: `Timeline "${demo.publicId}" has no events.`,
      });
    }
    for (const event of demo.events) {
      if (!event.startAt && !event.displayDate) {
        issues.push({
          code: "EVENT_WITHOUT_DATE",
          severity: "error",
          seedKey: KEY_EVENTS,
          message: `Event "${event.title}" in "${demo.publicId}" has neither startAt nor displayDate.`,
        });
      }
      if (event.startAt && event.endAt && new Date(event.endAt) < new Date(event.startAt)) {
        issues.push({
          code: "EVENT_ENDS_BEFORE_START",
          severity: "error",
          seedKey: KEY_EVENTS,
          message: `Event "${event.title}" in "${demo.publicId}" ends before it starts.`,
        });
      }
    }
  }
  return issues;
}

// ─── Reusable mutation functions (shared with the CLI) ───────────────────

export async function applyDemoAuthor(prisma: SeedPrismaClient): Promise<string> {
  const user = await prisma.user.upsert({
    where: { email: TIMELINEAI_DEMO_AUTHOR_EMAIL },
    update: {},
    create: {
      id: TIMELINEAI_DEMO_AUTHOR_ID,
      email: TIMELINEAI_DEMO_AUTHOR_EMAIL,
      name: "TimelineAI Examples",
      username: "timelineai-examples",
      isActive: true,
      // Not a real account — no password, so credentials sign-in is
      // impossible for it; it exists purely as the content owner of record.
    },
  });
  return user.id;
}

export async function applyDemoTimeline(
  prisma: SeedPrismaClient,
  authorId: string,
  demo: DemoTimelineInput
): Promise<"inserted" | "updated"> {
  const timelineId = timelineSeedId(demo.publicId);
  const existing = await prisma.timeline.findUnique({
    where: { id: timelineId },
    select: { id: true },
  });

  const timeline = await prisma.timeline.upsert({
    where: { id: timelineId },
    update: {
      title: demo.title,
      subtitle: demo.subtitle ?? null,
      description: demo.description ?? null,
      timelineType: demo.timelineType,
      layout: demo.layout,
    },
    create: {
      id: timelineId,
      publicId: demo.publicId,
      ownerUserId: authorId,
      title: demo.title,
      subtitle: demo.subtitle ?? null,
      description: demo.description ?? null,
      timelineType: demo.timelineType,
      layout: demo.layout,
      visibility: "public",
      moderationStatus: "not_required",
      editingState: "published",
      publishedAt: new Date(),
    },
  });

  // Full delete-then-recreate for events keeps this idempotent without a
  // stable per-event unique key — matches the app's own
  // updateTimelineContent behaviour (lib/server/services/timelines.ts).
  await prisma.timelineEvent.deleteMany({ where: { timelineId: timeline.id } });
  await prisma.timelineEvent.createMany({
    data: demo.events.map((event, index) => ({
      timelineId: timeline.id,
      startAt: event.startAt ? new Date(event.startAt) : null,
      endAt: event.endAt ? new Date(event.endAt) : null,
      displayDate: event.displayDate ?? null,
      title: event.title,
      description: event.description ?? null,
      imageUrl: event.imageUrl ?? null,
      icon: event.icon ?? null,
      label: event.label ?? null,
      link: event.link ?? null,
      accentColor: event.accentColor ?? null,
      sortOrder: index,
    })),
  });

  return existing ? "updated" : "inserted";
}

/**
 * The whole TimelineAI demo seed. `onlyIfEmpty` preserves the deployment
 * behaviour of the CLI's `--only-if-empty` flag: re-running converges, but it
 * would also overwrite an edit made to a demo timeline in production —
 * including a moderator unpublishing one. So on deploy we only plant examples
 * into a database with no timelines at all.
 */
export async function seedTimelineai(
  prisma: SeedPrismaClient,
  options: { onlyIfEmpty?: boolean } = {}
) {
  if (options.onlyIfEmpty) {
    const existing = await prisma.timeline.count();
    if (existing > 0) {
      return { skipped: true as const, existing, inserted: 0, updated: 0 };
    }
  }

  const authorId = await applyDemoAuthor(prisma);
  let inserted = 0;
  let updated = 0;
  for (const demo of TIMELINEAI_DEMOS) {
    const outcome = await applyDemoTimeline(prisma, authorId, demo);
    if (outcome === "inserted") inserted += 1;
    else updated += 1;
  }
  return { skipped: false as const, existing: 0, inserted, updated };
}

// ─── Inspection ──────────────────────────────────────────────────────────

interface TimelineaiSnapshot {
  entities: SeedEntityCounts[];
  authorPresent: boolean;
  seedOwnedCount: number;
  missingCount: number;
  driftedCount: number;
  orphanedCount: number;
  /** Seed-owned timeline ids actually present. The deletion allowlist. */
  presentSeedIds: string[];
  /** `seed-timeline-*` rows the current code no longer defines. */
  orphanIds: string[];
}

async function snapshot(prisma: SeedPrismaClient): Promise<TimelineaiSnapshot> {
  const author = await prisma.user.findUnique({
    where: { email: TIMELINEAI_DEMO_AUTHOR_EMAIL },
    select: { id: true },
  });

  const rows = await prisma.timeline.findMany({
    where: { id: { startsWith: "seed-timeline-" } },
    select: {
      id: true,
      title: true,
      subtitle: true,
      description: true,
      timelineType: true,
      layout: true,
      _count: { select: { events: true } },
    },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));

  let missing = 0;
  let drifted = 0;
  let eventsPresent = 0;
  let eventsExpected = 0;
  let eventsDrifted = 0;
  const presentSeedIds: string[] = [];

  for (const demo of TIMELINEAI_DEMOS) {
    const id = timelineSeedId(demo.publicId);
    const row = byId.get(id);
    eventsExpected += demo.events.length;
    if (!row) {
      missing += 1;
      continue;
    }
    presentSeedIds.push(id);
    eventsPresent += row._count.events;
    if (row._count.events !== demo.events.length) eventsDrifted += 1;
    if (
      row.title !== demo.title ||
      row.subtitle !== (demo.subtitle ?? null) ||
      row.description !== (demo.description ?? null) ||
      row.timelineType !== demo.timelineType ||
      row.layout !== demo.layout
    ) {
      drifted += 1;
    }
  }

  const known = new Set(SEED_TIMELINE_IDS);
  const orphanIds = rows.map((row) => row.id).filter((id) => !known.has(id));

  const entities: SeedEntityCounts[] = [
    {
      entity: "Demo author",
      seedKey: KEY_AUTHOR,
      present: author ? 1 : 0,
      missing: author ? 0 : 1,
      drifted: 0,
      orphaned: 0,
    },
    {
      entity: "Demo timelines",
      seedKey: KEY_TIMELINES,
      present: presentSeedIds.length,
      missing,
      drifted,
      orphaned: orphanIds.length,
    },
    {
      entity: "Timeline events",
      seedKey: KEY_EVENTS,
      present: eventsPresent,
      missing: Math.max(0, eventsExpected - eventsPresent),
      drifted: eventsDrifted,
      orphaned: 0,
    },
  ];

  return {
    entities,
    authorPresent: Boolean(author),
    seedOwnedCount: entities.reduce((total, e) => total + e.present, 0),
    missingCount: entities.reduce((total, e) => total + e.missing, 0),
    driftedCount: entities.reduce((total, e) => total + e.drifted, 0),
    orphanedCount: orphanIds.length,
    presentSeedIds,
    orphanIds,
  };
}

function healthOf(snap: Pick<TimelineaiSnapshot, "missingCount" | "driftedCount" | "orphanedCount">) {
  if (snap.missingCount > 0) return "missing" as const;
  if (snap.driftedCount > 0) return "drifted" as const;
  if (snap.orphanedCount > 0) return "orphaned" as const;
  return "clean" as const;
}

/**
 * Whether the shared demo-author User row may be deleted: only when it owns
 * nothing beyond the timelines this seed defines. Anything else — a timeline
 * someone created under that account, a linked OAuth account, a role grant —
 * means we retain the user and say why.
 */
async function authorRetentionReason(
  prisma: SeedPrismaClient
): Promise<string | null> {
  const author = await prisma.user.findUnique({
    where: { email: TIMELINEAI_DEMO_AUTHOR_EMAIL },
    select: { id: true },
  });
  if (!author) return null;

  const [otherTimelines, accounts, sessions, roles] = await Promise.all([
    prisma.timeline.count({
      where: { ownerUserId: author.id, id: { notIn: SEED_TIMELINE_IDS } },
    }),
    prisma.account.count({ where: { userId: author.id } }),
    prisma.session.count({ where: { userId: author.id } }),
    prisma.userRole.count({ where: { userId: author.id } }),
  ]);

  if (otherTimelines > 0) {
    return `owns ${otherTimelines} timeline(s) this seed did not create`;
  }
  if (accounts > 0) return "has linked sign-in accounts";
  if (sessions > 0) return "has active sessions";
  if (roles > 0) return "has role assignments";
  return null;
}

// ─── Provider ────────────────────────────────────────────────────────────

export const timelineaiProvider: SeedProvider = {
  id: PROVIDER_ID,
  appId: "timelineai",
  displayName: "TimelineAI",
  description:
    "Public example timelines covering every layout, plus the demo author that owns them. Pinned to deterministic ids, so removal is exact.",
  databaseKind: "shared-prisma",
  availability: "configured",
  protected: false,
  definitionVersion: TIMELINEAI_DEFINITION_VERSION,
  requiredEnv: requiredEnvVars("shared-prisma"),
  supports: { validate: true, status: true, seed: true, reconcile: true, remove: true },
  manifest: [
    {
      seedKey: KEY_AUTHOR,
      entity: "User",
      identity: "id",
      ownership: "seed-owned-shared",
      reconcilable: false,
      removable: true,
      protectedFields: ["password", "email"],
      userControlledFields: ["name", "image", "bio"],
      notes: `Fixed id "${TIMELINEAI_DEMO_AUTHOR_ID}". Retained on removal if it owns anything the seed did not create.`,
    },
    {
      seedKey: KEY_TIMELINES,
      entity: "Timeline",
      identity: "id",
      ownership: "seed-owned",
      dependsOn: [KEY_AUTHOR],
      reconcilable: true,
      removable: true,
      notes: 'Ids are exactly "seed-timeline-<publicId>". Nothing outside that set is ever deleted.',
    },
    {
      seedKey: KEY_EVENTS,
      entity: "TimelineEvent",
      identity: "unique-key",
      ownership: "seed-owned",
      dependsOn: [KEY_TIMELINES],
      reconcilable: true,
      removable: true,
      notes: "Owned transitively by their timeline; replaced wholesale on reconcile.",
    },
  ],

  async validate(context): Promise<ValidationResult> {
    const startedAt = Date.now();
    const issues = validateTimelineaiDefinitions();
    let connection: ValidationResult["connection"] = "ok";
    try {
      await withPrisma(context.connectionString, async (prisma) => {
        await prisma.$queryRaw`SELECT 1`;
        await prisma.timeline.count();
      });
    } catch (error) {
      connection = "unreachable";
      const { code, message } = sanitizeError(error);
      issues.push({ code, severity: "error", message });
    }
    return {
      ok: connection === "ok" && !issues.some((i) => i.severity === "error"),
      definitionVersion: TIMELINEAI_DEFINITION_VERSION,
      definitionChecksum: DEFINITION_CHECKSUM,
      connection,
      issues,
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
    };
  },

  async inspect(context): Promise<SeedStatus> {
    const startedAt = Date.now();
    try {
      const snap = await withPrisma(context.connectionString, snapshot);
      return {
        health: healthOf(snap),
        definitionVersion: TIMELINEAI_DEFINITION_VERSION,
        definitionChecksum: DEFINITION_CHECKSUM,
        connection: "ok",
        seedOwnedCount: snap.seedOwnedCount,
        missingCount: snap.missingCount,
        driftedCount: snap.driftedCount,
        orphanedCount: snap.orphanedCount,
        entities: snap.entities,
        issues: snap.orphanIds.length
          ? [
              {
                code: "ORPHANED_SEED_ROWS",
                severity: "warning",
                seedKey: KEY_TIMELINES,
                message: `${snap.orphanIds.length} seed-owned timeline(s) exist that the current code no longer defines.`,
              },
            ]
          : [],
        checkedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      const { code, message } = sanitizeError(error);
      return unavailableStatus(code, message, startedAt, DEFINITION);
    }
  },

  async plan(context, operation): Promise<SeedPlan> {
    const createdAt = Date.now();
    const changes: SeedPlanChange[] = [];
    const warnings: SeedIssue[] = [];
    const blocked: SeedIssue[] = [];

    await withPrisma(context.connectionString, async (prisma) => {
      const snap = await snapshot(prisma);

      if (operation === "remove") {
        // Deletion is dependency-aware and bottom-up: events, then
        // timelines, then the shared author only if nothing else needs it.
        const eventCount = snap.entities.find((e) => e.seedKey === KEY_EVENTS)?.present ?? 0;
        if (eventCount > 0) {
          changes.push({ seedKey: KEY_EVENTS, entity: "Timeline events", action: "delete", count: eventCount });
        }
        if (snap.presentSeedIds.length > 0) {
          changes.push({
            seedKey: KEY_TIMELINES,
            entity: "Demo timelines",
            action: "delete",
            count: snap.presentSeedIds.length,
          });
        }
        if (snap.orphanIds.length > 0) {
          // Orphans carry the seed id prefix, so ownership is provable, but
          // they are not in the current definitions — surface them rather
          // than deleting silently.
          changes.push({
            seedKey: KEY_TIMELINES,
            entity: "Orphaned seed timelines",
            action: "delete",
            count: snap.orphanIds.length,
          });
          warnings.push({
            code: "ORPHANS_INCLUDED",
            severity: "warning",
            seedKey: KEY_TIMELINES,
            message: `${snap.orphanIds.length} orphaned seed-owned timeline(s) will also be removed.`,
          });
        }

        const retention = await authorRetentionReason(prisma);
        if (snap.authorPresent && retention) {
          changes.push({
            seedKey: KEY_AUTHOR,
            entity: "Demo author",
            action: "retain",
            count: 1,
            reason: `Shared user retained — it ${retention}.`,
          });
        } else if (snap.authorPresent) {
          changes.push({ seedKey: KEY_AUTHOR, entity: "Demo author", action: "delete", count: 1 });
        }
        return;
      }

      for (const entity of snap.entities) {
        if (entity.seedKey === KEY_AUTHOR && entity.missing > 0) {
          changes.push({ seedKey: entity.seedKey, entity: entity.entity, action: "insert", count: 1 });
          continue;
        }
        if (entity.missing > 0) {
          changes.push({
            seedKey: entity.seedKey,
            entity: entity.entity,
            action: "insert",
            count: entity.missing,
          });
        }
        if (entity.drifted > 0) {
          if (operation === "reconcile") {
            changes.push({
              seedKey: entity.seedKey,
              entity: entity.entity,
              action: "update",
              count: entity.drifted,
            });
          } else {
            changes.push({
              seedKey: entity.seedKey,
              entity: entity.entity,
              action: "retain",
              count: entity.drifted,
              reason: "Drifted rows are left alone by “Seed missing”. Use Reconcile to refresh them.",
            });
          }
        }
      }

      // Reconciliation never prunes here: an orphan may be a demo timeline
      // someone deliberately kept after it left the code catalog.
      if (snap.orphanIds.length > 0) {
        changes.push({
          seedKey: KEY_TIMELINES,
          entity: "Orphaned seed timelines",
          action: "retain",
          count: snap.orphanIds.length,
          reason: "Reconcile never prunes. Use “Remove seeded data” to clear orphans.",
        });
      }
    });

    return buildPlan({
      providerId: PROVIDER_ID,
      environment: context.environment,
      operation,
      changes,
      blocked,
      warnings,
      createdAt,
      definitionVersion: TIMELINEAI_DEFINITION_VERSION,
      definitionChecksum: DEFINITION_CHECKSUM,
    });
  },

  async execute(context, approvedPlan): Promise<SeedResult> {
    const startedAt = Date.now();
    try {
      const outcome = await withPrisma(context.connectionString, async (prisma) => {
        if (approvedPlan.operation === "remove") {
          return removeTimelineai(prisma, context);
        }
        context.report?.({ stage: "executing", message: "Seeding demo timelines", percent: 30 });
        const applied = await seedTimelineai(prisma);
        context.report?.({ stage: "verifying", message: "Re-inspecting", percent: 90 });
        const verified = await snapshot(prisma);
        return {
          perEntity: [
            { seedKey: KEY_TIMELINES, entity: "Demo timelines", action: "insert" as const, count: applied.inserted },
            { seedKey: KEY_TIMELINES, entity: "Demo timelines", action: "update" as const, count: applied.updated },
          ].filter((change) => change.count > 0),
          deleted: 0,
          retained: 0,
          verified,
        };
      });

      const inserted = outcome.perEntity
        .filter((c) => c.action === "insert")
        .reduce((total, c) => total + c.count, 0);
      const updated = outcome.perEntity
        .filter((c) => c.action === "update")
        .reduce((total, c) => total + c.count, 0);

      return {
        ok: true,
        partial: false,
        inserted,
        updated,
        deleted: outcome.deleted,
        retained: outcome.retained,
        perEntity: outcome.perEntity,
        issues: [],
        verifiedStatus: {
          health: healthOf(outcome.verified),
          definitionVersion: TIMELINEAI_DEFINITION_VERSION,
          definitionChecksum: DEFINITION_CHECKSUM,
          connection: "ok",
          seedOwnedCount: outcome.verified.seedOwnedCount,
          missingCount: outcome.verified.missingCount,
          driftedCount: outcome.verified.driftedCount,
          orphanedCount: outcome.verified.orphanedCount,
          entities: outcome.verified.entities,
          issues: [],
          checkedAt: new Date().toISOString(),
          durationMs: 0,
        },
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      const { code, message } = sanitizeError(error);
      return {
        ok: false,
        partial: false,
        inserted: 0,
        updated: 0,
        deleted: 0,
        retained: 0,
        perEntity: [],
        issues: [{ code, severity: "error", message }],
        durationMs: Date.now() - startedAt,
      };
    }
  },
};

/**
 * FK-safe, allowlist-only removal inside a single transaction: events first,
 * then the timelines whose ids the seed pins, then the shared author if and
 * only if nothing else references it.
 */
async function removeTimelineai(prisma: SeedPrismaClient, context: SeedProviderContext) {
  const snap = await snapshot(prisma);
  const removableIds = [...snap.presentSeedIds, ...snap.orphanIds];
  const retention = await authorRetentionReason(prisma);

  context.report?.({ stage: "executing", message: "Removing seed-owned rows", percent: 40 });

  const result = await prisma.$transaction(async (tx) => {
    const events = removableIds.length
      ? await tx.timelineEvent.deleteMany({ where: { timelineId: { in: removableIds } } })
      : { count: 0 };
    const timelines = removableIds.length
      ? await tx.timeline.deleteMany({ where: { id: { in: removableIds } } })
      : { count: 0 };

    let authorDeleted = 0;
    if (snap.authorPresent && !retention) {
      const deleted = await tx.user.deleteMany({
        where: { id: TIMELINEAI_DEMO_AUTHOR_ID, email: TIMELINEAI_DEMO_AUTHOR_EMAIL },
      });
      authorDeleted = deleted.count;
    }
    return { events: events.count, timelines: timelines.count, authorDeleted };
  });

  context.report?.({ stage: "verifying", message: "Re-inspecting", percent: 90 });
  const verified = await snapshot(prisma);

  const perEntity: SeedPlanChange[] = ([
    { seedKey: KEY_EVENTS, entity: "Timeline events", action: "delete", count: result.events },
    { seedKey: KEY_TIMELINES, entity: "Demo timelines", action: "delete", count: result.timelines },
    { seedKey: KEY_AUTHOR, entity: "Demo author", action: "delete", count: result.authorDeleted },
  ] as SeedPlanChange[]).filter((change) => change.count > 0);

  const retained = retention && snap.authorPresent ? 1 : 0;
  if (retained) {
    perEntity.push({
      seedKey: KEY_AUTHOR,
      entity: "Demo author",
      action: "retain",
      count: 1,
      reason: `Shared user retained — it ${retention}.`,
    });
  }

  return {
    perEntity,
    deleted: result.events + result.timelines + result.authorDeleted,
    retained,
    verified,
  };
}

export { DEFINITION_CHECKSUM as TIMELINEAI_DEFINITION_CHECKSUM };
