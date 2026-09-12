import "server-only";
import { prisma, Prisma } from "../db";
import { assertAccess, ForbiddenError, NotFoundError, type ViewerContext } from "../authz";
import { isAiEnabled } from "../../ai/kill-switch";
import { enforceAiQuota } from "../ai-quota";
import { getConfiguredProvider, AiProviderError } from "../../ai/provider";
import { redactForAudit } from "../../ai/redact";
import { preservesFactualAnchors, type NarrativeVariant } from "../../ai/narrative";
import type { AiProposalKind, AiProposalPayload } from "../../ai/schemas";
import type { ContentSummary } from "../../ai/visual-director";
import { VISUAL_DIRECTOR_ACCENTS, VISUAL_DIRECTOR_BACKGROUNDS } from "../../ai/visual-accessibility";

export class AiDisabledError extends Error {
  readonly status = 503;
  constructor() {
    super("AI features are disabled for this app right now.");
    this.name = "AiDisabledError";
  }
}

export class ProposalStateError extends Error {
  readonly status = 409;
  constructor(message: string) {
    super(message);
    this.name = "ProposalStateError";
  }
}

export class LockedTargetError extends Error {
  readonly status = 409;
  constructor(message = "This content is locked and the AI copilot cannot rewrite it.") {
    super(message);
    this.name = "LockedTargetError";
  }
}

export class InvalidNarrativeTargetError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "InvalidNarrativeTargetError";
  }
}

type NarrativeField = "title" | "subtitle" | "description";

/** True if the narrative copilot must not touch this field, checked at both generate- and accept-time. */
async function isNarrativeTargetLocked(
  timelineId: string,
  eventId: string | undefined,
  field: NarrativeField
): Promise<boolean> {
  if (eventId) {
    const event = await prisma.timelineEvent.findUnique({ where: { id: eventId }, select: { aiLocked: true } });
    return event?.aiLocked ?? false;
  }
  const timeline = await prisma.timeline.findUnique({ where: { id: timelineId }, select: { aiLockedFields: true } });
  const locked = Array.isArray(timeline?.aiLockedFields) ? (timeline!.aiLockedFields as string[]) : [];
  return locked.includes(field);
}

async function loadTimelineForEdit(timelineId: string, viewer: ViewerContext) {
  const timeline = await prisma.timeline.findUnique({ where: { id: timelineId } });
  if (!timeline) throw new NotFoundError("That timeline doesn't exist.");
  assertAccess(timeline, viewer, "edit");
  return timeline;
}

/**
 * Server-derived, never client-supplied — a client claiming "many branches"
 * to steer the recommendation would just be describing content it doesn't
 * have, so this is computed straight from the timeline's own rows.
 */
async function summarizeContentForVisualDirector(timelineId: string): Promise<ContentSummary> {
  const events = await prisma.timelineEvent.findMany({
    where: { timelineId },
    select: { startAt: true, endAt: true, description: true, label: true },
  });
  const eventCount = events.length;
  const hasDurations = events.some((e) => e.startAt && e.endAt);
  const distinctLabels = new Set(events.map((e) => e.label).filter(Boolean));
  const hasManyBranches = distinctLabels.size > 3;
  const avgDescriptionLength = eventCount
    ? Math.round(events.reduce((sum, e) => sum + (e.description?.length ?? 0), 0) / eventCount)
    : 0;
  return { eventCount, hasDurations, hasManyBranches, avgDescriptionLength };
}

function identityFor(viewer: ViewerContext): string {
  const id = viewer.userId ?? viewer.guestIdHash;
  if (!id) throw new ForbiddenError("Could not identify you for AI quota tracking.");
  return id;
}

/**
 * Calls the configured provider and persists the result as a pending
 * proposal — this never touches Timeline/TimelineEvent rows. A provider
 * failure is recorded to the audit trail (redacted, no raw source content)
 * and rethrown; nothing partial is ever persisted.
 */
export interface GenerateAiProposalOptions {
  /** Pre-chunked source document, set only for cited-import generations (lib/server/services/source-import.ts). */
  chunks?: { id: string; text: string }[];
  sourceContentHash?: string;
  /** Required for kind "temporal_correction" — the event whose date is being reinterpreted. */
  targetEventId?: string;
  /** For kind "narrative_suggestion" — which field to rewrite, whose voice, for which event (absent = timeline-level). */
  narrativeField?: NarrativeField;
  narrativeEventId?: string;
  narrativeAudiencePreset?: import("../../ai/narrative").NarrativeAudiencePreset;
}

export async function generateAiProposal(
  timelineId: string,
  viewer: ViewerContext,
  kind: AiProposalKind,
  sourceContent: string,
  options: GenerateAiProposalOptions = {}
) {
  if (!isAiEnabled()) throw new AiDisabledError();
  await loadTimelineForEdit(timelineId, viewer);
  await enforceAiQuota(identityFor(viewer));

  const contentSummary = kind === "visual_recommendation" ? await summarizeContentForVisualDirector(timelineId) : undefined;
  let narrativeTarget: {
    field: NarrativeField;
    eventId?: string;
    currentText: string;
    audiencePreset?: import("../../ai/narrative").NarrativeAudiencePreset;
  } | undefined;

  if (kind === "narrative_suggestion") {
    const field = options.narrativeField ?? "description";
    if (await isNarrativeTargetLocked(timelineId, options.narrativeEventId, field)) {
      throw new LockedTargetError();
    }
    if (options.narrativeEventId && field === "subtitle") {
      throw new InvalidNarrativeTargetError('Events have no "subtitle" field — target "title" or "description" instead.');
    }
    const currentText = options.narrativeEventId
      ? ((await prisma.timelineEvent.findUnique({ where: { id: options.narrativeEventId } }))?.[field as "title" | "description"] ?? "")
      : ((await prisma.timeline.findUnique({ where: { id: timelineId } }))?.[field] ?? "");
    narrativeTarget = {
      field,
      eventId: options.narrativeEventId,
      currentText: currentText ?? "",
      audiencePreset: options.narrativeAudiencePreset,
    };
  }

  const provider = await getConfiguredProvider();

  try {
    const result = await provider.generate({
      kind,
      timelineId,
      sourceContent,
      chunks: options.chunks,
      sourceContentHash: options.sourceContentHash,
      targetEventId: options.targetEventId,
      contentSummary,
      narrativeTarget,
    });

    // Advisory only — a rewrite that fails this heuristic still gets
    // stored as a pending proposal for the human to review, never
    // auto-rejected (the check itself can false-positive).
    const factDriftWarning =
      result.payload.kind === "narrative_suggestion" &&
      narrativeTarget &&
      !preservesFactualAnchors(narrativeTarget.currentText, result.payload.suggestedText);

    const proposal = await prisma.timelineAiProposal.create({
      data: {
        timelineId,
        kind,
        status: "pending",
        payload: result.payload as unknown as Prisma.InputJsonValue,
        createdByUserId: viewer.userId,
      },
    });

    await prisma.timelineAiEvent.create({
      data: {
        timelineId,
        proposalId: proposal.id,
        action: "generated",
        actorUserId: viewer.userId,
        metadata: {
          kind,
          provider: result.model.provider,
          model: result.model.model,
          warningCount: result.warnings.length + (factDriftWarning ? 1 : 0),
          ...(factDriftWarning ? { possibleFactDrift: true } : {}),
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return proposal;
  } catch (error) {
    await prisma.timelineAiEvent.create({
      data: {
        timelineId,
        action: "provider_failure",
        actorUserId: viewer.userId,
        metadata: {
          kind,
          reason: error instanceof AiProviderError ? redactForAudit(error.message) : "unknown_error",
        } as unknown as Prisma.InputJsonValue,
      },
    });
    throw error;
  }
}

/** Recent proposals for a timeline's AI copilot panel, newest first. */
export async function listAiProposals(timelineId: string, viewer: ViewerContext) {
  await loadTimelineForEdit(timelineId, viewer);
  const proposals = await prisma.timelineAiProposal.findMany({
    where: { timelineId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // For a cited-import's events_extraction proposal, flag which of its
  // chunks already produced an accepted event on a *previous* import of
  // the same document — recomputed on every list call (not stored on the
  // proposal) so it stays accurate even after a reload or a later accept.
  //
  // For a narrative_suggestion, surface the possibleFactDrift heuristic
  // generateAiProposal already computed and recorded on the "generated"
  // audit event's metadata (see the factDriftWarning block above) — it was
  // never stored on the proposal row itself, only the audit trail, so it's
  // read back from there rather than recomputed.
  return Promise.all(
    proposals.map(async (proposal) => {
      const payload = proposal.payload as unknown as AiProposalPayload;
      let alreadyImportedChunkIds: string[] = [];
      let possibleFactDrift = false;

      if (payload.kind === "events_extraction" && payload.sourceContentHash) {
        const chunkIds = payload.events.map((e) => e.sourceChunkId).filter((id): id is string => !!id);
        if (chunkIds.length > 0) {
          const rows = await prisma.timelineImportedEvent.findMany({
            where: { timelineId, contentHash: payload.sourceContentHash, chunkId: { in: chunkIds } },
            select: { chunkId: true },
          });
          alreadyImportedChunkIds = rows.map((r) => r.chunkId);
        }
      } else if (payload.kind === "narrative_suggestion") {
        const generatedEvent = await prisma.timelineAiEvent.findFirst({
          where: { proposalId: proposal.id, action: "generated" },
          select: { metadata: true },
        });
        const metadata = generatedEvent?.metadata as Record<string, unknown> | null;
        possibleFactDrift = metadata?.possibleFactDrift === true;
      }

      return { ...proposal, alreadyImportedChunkIds, possibleFactDrift };
    })
  );
}

async function loadPendingOrAcceptedProposal(proposalId: string, viewer: ViewerContext) {
  const proposal = await prisma.timelineAiProposal.findUnique({ where: { id: proposalId } });
  if (!proposal) throw new NotFoundError("That AI proposal doesn't exist.");
  await loadTimelineForEdit(proposal.timelineId, viewer);
  return proposal;
}

export async function rejectAiProposal(proposalId: string, viewer: ViewerContext) {
  const proposal = await loadPendingOrAcceptedProposal(proposalId, viewer);
  if (proposal.status !== "pending") {
    throw new ProposalStateError(`Cannot reject a proposal in "${proposal.status}" state.`);
  }

  const updated = await prisma.timelineAiProposal.update({
    where: { id: proposalId },
    data: { status: "rejected", resolvedByUserId: viewer.userId, resolvedAt: new Date() },
  });

  await prisma.timelineAiEvent.create({
    data: {
      timelineId: proposal.timelineId,
      proposalId,
      action: "rejected",
      actorUserId: viewer.userId,
    },
  });

  return updated;
}

/**
 * Applies a proposal's payload to the timeline inside one transaction,
 * capturing just enough of the pre-change state as `snapshot` for
 * undoAiProposal to reverse it later.
 */
export interface ApplyProposalOptions {
  /** For visual_recommendation proposals — which candidate to apply. Defaults to the payload's recommendedIndex. */
  candidateIndex?: number;
  /** Which narrative_suggestion variant to apply — defaults to the payload's suggestedText (the "standard" variant) when omitted. */
  variant?: NarrativeVariant;
  /**
   * For events_extraction proposals only — which indexes into `payload.events`
   * to actually create, so a creator can drop specific proposed events (e.g.
   * an uncited one) without rejecting the whole batch. Defaults to all of
   * them. Indexes outside the payload's range are silently ignored rather
   * than erroring, since a stale client-side selection shouldn't fail the
   * whole accept.
   */
  eventIndexes?: number[];
}

async function applyProposal(
  tx: Prisma.TransactionClient,
  timelineId: string,
  payload: AiProposalPayload,
  options: ApplyProposalOptions = {}
): Promise<Prisma.InputJsonValue> {
  switch (payload.kind) {
    case "events_extraction": {
      const maxOrder = await tx.timelineEvent.aggregate({
        where: { timelineId },
        _max: { sortOrder: true },
      });
      let nextOrder = (maxOrder._max.sortOrder ?? -1) + 1;

      const contentHash = payload.sourceContentHash;
      const createdEventIds: string[] = [];
      const skippedChunkIds: string[] = [];

      const selectedEvents = options.eventIndexes
        ? options.eventIndexes.map((i) => payload.events[i]).filter((e): e is (typeof payload.events)[number] => !!e)
        : payload.events;

      for (const event of selectedEvents) {
        // Cited-import dedupe: a chunk that's already produced an accepted
        // event for this exact source document is skipped rather than
        // creating a duplicate — this is what makes re-import idempotent.
        if (contentHash && event.sourceChunkId) {
          const existing = await tx.timelineImportedEvent.findUnique({
            where: {
              timelineId_contentHash_chunkId: {
                timelineId,
                contentHash,
                chunkId: event.sourceChunkId,
              },
            },
          });
          if (existing) {
            skippedChunkIds.push(event.sourceChunkId);
            continue;
          }
        }

        const created = await tx.timelineEvent.create({
          data: {
            timelineId,
            title: event.title,
            description: event.description ?? null,
            displayDate: event.displayDate ?? null,
            startAt: event.startAt ? new Date(event.startAt) : null,
            endAt: event.endAt ? new Date(event.endAt) : null,
            sortOrder: nextOrder++,
          },
        });
        createdEventIds.push(created.id);

        if (contentHash && event.sourceChunkId) {
          await tx.timelineImportedEvent.create({
            data: { timelineId, contentHash, chunkId: event.sourceChunkId, eventId: created.id },
          });
        }
      }

      if (createdEventIds.length > 0) {
        await tx.timeline.update({ where: { id: timelineId }, data: { version: { increment: 1 } } });
      }
      return { createdEventIds, skippedChunkIds };
    }

    case "narrative_suggestion": {
      const field = payload.field;
      const text = options.variant
        ? payload.variants.find((v) => v.variant === options.variant)?.text ?? payload.suggestedText
        : payload.suggestedText;

      if (payload.eventId) {
        const event = await tx.timelineEvent.findUnique({ where: { id: payload.eventId } });
        if (!event || event.timelineId !== timelineId) {
          throw new NotFoundError("The event this suggestion targets no longer exists.");
        }
        if (event.aiLocked) throw new LockedTargetError();
        if (field === "subtitle") {
          throw new InvalidNarrativeTargetError('Events have no "subtitle" field — cannot apply this suggestion.');
        }

        const eventField = field;
        const previousValue = event[eventField];
        await tx.timelineEvent.update({
          where: { id: payload.eventId },
          data: { [eventField]: text },
        });
        await tx.timeline.update({ where: { id: timelineId }, data: { version: { increment: 1 } } });
        return { target: "event", eventId: payload.eventId, field: eventField, previousValue };
      }

      const timeline = await tx.timeline.findUniqueOrThrow({ where: { id: timelineId } });
      const lockedFields = Array.isArray(timeline.aiLockedFields) ? (timeline.aiLockedFields as string[]) : [];
      if (lockedFields.includes(field)) throw new LockedTargetError();

      const previousValue = timeline[field as "title" | "subtitle" | "description"];
      await tx.timeline.update({
        where: { id: timelineId },
        data: { [field]: text, version: { increment: 1 } },
      });
      return { target: "timeline", field, previousValue };
    }

    case "visual_recommendation": {
      const index = options.candidateIndex ?? payload.recommendedIndex;
      const candidate = payload.candidates[index];
      if (!candidate) {
        throw new NotFoundError("That visual-direction candidate no longer exists on this proposal.");
      }

      const timeline = await tx.timeline.findUniqueOrThrow({ where: { id: timelineId } });
      const previousLayout = timeline.layout;
      const previousTheme = timeline.theme;

      const background = VISUAL_DIRECTOR_BACKGROUNDS.find((b) => b.id === candidate.backgroundId);
      const accent = VISUAL_DIRECTOR_ACCENTS.find((a) => a.id === candidate.accentId);
      // Both are schema-validated enum members of these exact lists, so a
      // miss here would mean the token set changed between generation and
      // acceptance — treated as "nothing to apply" rather than writing a
      // half-resolved theme.
      if (!background || !accent) {
        throw new NotFoundError("This candidate's color tokens are no longer available.");
      }

      const previousThemeObject = (previousTheme as Record<string, unknown> | null) ?? {};
      const nextTheme = {
        ...previousThemeObject,
        // TimelineRenderer never reads theme.background (it derives
        // background from theme.preset's CSS, via resolveThemePreset) —
        // "paper" -> the closest light preset, "midnight" -> the matching
        // dark preset, so this candidate's chosen background actually shows
        // up. Recorded here as a real fix, not a new behavior: a
        // visual_recommendation applied before this line changed the
        // layout/accent/density/cardStyle but silently left the background
        // untouched.
        preset: candidate.backgroundId === "midnight" ? "midnight" : "canvas",
        accentColor: accent.hex,
        density: candidate.density,
        cardStyle: candidate.cardStyle,
      };

      // Presentation only — this never touches a TimelineEvent row.
      await tx.timeline.update({
        where: { id: timelineId },
        data: {
          layout: candidate.layout,
          theme: nextTheme as unknown as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });
      return { target: "timeline", previousLayout, previousTheme };
    }

    case "temporal_correction": {
      const event = await tx.timelineEvent.findUnique({ where: { id: payload.eventId } });
      if (!event || event.timelineId !== timelineId) {
        throw new NotFoundError("The event this correction targets no longer exists.");
      }
      const previousValue = {
        displayDate: event.displayDate,
        startAt: event.startAt ? event.startAt.toISOString() : null,
        endAt: event.endAt ? event.endAt.toISOString() : null,
        temporalPrecision: event.temporalPrecision,
      };

      // Only day/month/year precision (unambiguously a single point in
      // time) ever sets startAt — anything coarser (decade, century,
      // season, range, unknown) is display-only via displayDate, exactly
      // so an approximate date can never masquerade as an exact one.
      const value = payload.temporalValue;
      const canResolveStartAt = value.era === "CE" && ["day", "month", "year"].includes(value.precision);
      const startAt = canResolveStartAt
        ? new Date(Date.UTC(value.year!, (value.month ?? 1) - 1, value.day ?? 1))
        : null;

      await tx.timelineEvent.update({
        where: { id: payload.eventId },
        data: {
          displayDate: value.displayText,
          startAt,
          temporalPrecision: value as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.timeline.update({ where: { id: timelineId }, data: { version: { increment: 1 } } });
      return { target: "event", eventId: payload.eventId, previousTemporalValue: previousValue };
    }
  }
}

async function revertProposal(
  tx: Prisma.TransactionClient,
  timelineId: string,
  snapshot: Record<string, unknown>
): Promise<void> {
  if (Array.isArray(snapshot.createdEventIds)) {
    const eventIds = snapshot.createdEventIds as string[];
    // Also clears the dedupe record for each created event, so undoing an
    // import and re-accepting the same (or a fresh) proposal for the same
    // source chunks recreates them instead of silently skipping.
    await tx.timelineImportedEvent.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.timelineEvent.deleteMany({ where: { id: { in: eventIds } } });
    await tx.timeline.update({ where: { id: timelineId }, data: { version: { increment: 1 } } });
    return;
  }

  if (snapshot.target === "event" && typeof snapshot.eventId === "string" && snapshot.previousTemporalValue) {
    const prev = snapshot.previousTemporalValue as {
      displayDate: string | null;
      startAt: string | null;
      endAt: string | null;
      temporalPrecision: unknown;
    };
    await tx.timelineEvent.update({
      where: { id: snapshot.eventId },
      data: {
        displayDate: prev.displayDate,
        startAt: prev.startAt ? new Date(prev.startAt) : null,
        endAt: prev.endAt ? new Date(prev.endAt) : null,
        temporalPrecision: (prev.temporalPrecision as Prisma.InputJsonValue | null) ?? Prisma.JsonNull,
      },
    });
    await tx.timeline.update({ where: { id: timelineId }, data: { version: { increment: 1 } } });
    return;
  }

  if (snapshot.target === "event" && typeof snapshot.eventId === "string" && typeof snapshot.field === "string") {
    await tx.timelineEvent.update({
      where: { id: snapshot.eventId },
      data: { [snapshot.field]: (snapshot.previousValue as string | null) ?? null },
    });
    await tx.timeline.update({ where: { id: timelineId }, data: { version: { increment: 1 } } });
    return;
  }

  if (snapshot.target === "timeline" && typeof snapshot.field === "string") {
    await tx.timeline.update({
      where: { id: timelineId },
      data: { [snapshot.field]: snapshot.previousValue, version: { increment: 1 } },
    });
    return;
  }

  if (snapshot.target === "timeline" && "previousLayout" in snapshot) {
    await tx.timeline.update({
      where: { id: timelineId },
      data: {
        layout: snapshot.previousLayout as string,
        theme: (snapshot.previousTheme as Prisma.InputJsonValue | null) ?? undefined,
        version: { increment: 1 },
      },
    });
  }
}

export async function acceptAiProposal(
  proposalId: string,
  viewer: ViewerContext,
  options: ApplyProposalOptions = {}
) {
  const proposal = await loadPendingOrAcceptedProposal(proposalId, viewer);
  if (proposal.status !== "pending") {
    throw new ProposalStateError(`Cannot accept a proposal in "${proposal.status}" state.`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const snapshot = await applyProposal(
      tx,
      proposal.timelineId,
      proposal.payload as unknown as AiProposalPayload,
      options
    );
    return tx.timelineAiProposal.update({
      where: { id: proposalId },
      data: {
        status: "accepted",
        snapshot,
        resolvedByUserId: viewer.userId,
        resolvedAt: new Date(),
      },
    });
  });

  await prisma.timelineAiEvent.create({
    data: {
      timelineId: proposal.timelineId,
      proposalId,
      action: "accepted",
      actorUserId: viewer.userId,
    },
  });

  return updated;
}

export async function undoAiProposal(proposalId: string, viewer: ViewerContext) {
  const proposal = await loadPendingOrAcceptedProposal(proposalId, viewer);
  if (proposal.status !== "accepted") {
    throw new ProposalStateError(`Cannot undo a proposal in "${proposal.status}" state.`);
  }
  if (!proposal.snapshot) {
    throw new ProposalStateError("This proposal has no recorded snapshot to undo.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    await revertProposal(tx, proposal.timelineId, proposal.snapshot as Record<string, unknown>);
    return tx.timelineAiProposal.update({
      where: { id: proposalId },
      data: { status: "undone", resolvedByUserId: viewer.userId, resolvedAt: new Date() },
    });
  });

  await prisma.timelineAiEvent.create({
    data: {
      timelineId: proposal.timelineId,
      proposalId,
      action: "undone",
      actorUserId: viewer.userId,
    },
  });

  return updated;
}
