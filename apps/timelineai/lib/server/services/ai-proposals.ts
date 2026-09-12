import "server-only";
import { prisma, type Prisma } from "../db";
import { assertAccess, ForbiddenError, NotFoundError, type ViewerContext } from "../authz";
import { isAiEnabled } from "../../ai/kill-switch";
import { enforceAiQuota } from "../ai-quota";
import { getConfiguredProvider, AiProviderError } from "../../ai/provider";
import { redactForAudit } from "../../ai/redact";
import type { AiProposalKind, AiProposalPayload } from "../../ai/schemas";

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

async function loadTimelineForEdit(timelineId: string, viewer: ViewerContext) {
  const timeline = await prisma.timeline.findUnique({ where: { id: timelineId } });
  if (!timeline) throw new NotFoundError("That timeline doesn't exist.");
  assertAccess(timeline, viewer, "edit");
  return timeline;
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
export async function generateAiProposal(
  timelineId: string,
  viewer: ViewerContext,
  kind: AiProposalKind,
  sourceContent: string
) {
  if (!isAiEnabled()) throw new AiDisabledError();
  await loadTimelineForEdit(timelineId, viewer);
  await enforceAiQuota(identityFor(viewer));

  const provider = await getConfiguredProvider();

  try {
    const result = await provider.generate({ kind, timelineId, sourceContent });

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
          warningCount: result.warnings.length,
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
async function applyProposal(
  tx: Prisma.TransactionClient,
  timelineId: string,
  payload: AiProposalPayload
): Promise<Prisma.InputJsonValue> {
  switch (payload.kind) {
    case "events_extraction": {
      const maxOrder = await tx.timelineEvent.aggregate({
        where: { timelineId },
        _max: { sortOrder: true },
      });
      let nextOrder = (maxOrder._max.sortOrder ?? -1) + 1;

      const created = await Promise.all(
        payload.events.map((event) =>
          tx.timelineEvent.create({
            data: {
              timelineId,
              title: event.title,
              description: event.description ?? null,
              displayDate: event.displayDate ?? null,
              startAt: event.startAt ? new Date(event.startAt) : null,
              endAt: event.endAt ? new Date(event.endAt) : null,
              sortOrder: nextOrder++,
            },
          })
        )
      );

      await tx.timeline.update({ where: { id: timelineId }, data: { version: { increment: 1 } } });
      return { createdEventIds: created.map((e) => e.id) };
    }

    case "narrative_suggestion": {
      const field = payload.field;
      if (payload.eventId) {
        const event = await tx.timelineEvent.findUnique({ where: { id: payload.eventId } });
        if (!event || event.timelineId !== timelineId) {
          throw new NotFoundError("The event this suggestion targets no longer exists.");
        }
        // Timeline events only expose a description field for narrative suggestions.
        const previousValue = event.description;
        await tx.timelineEvent.update({
          where: { id: payload.eventId },
          data: { description: payload.suggestedText },
        });
        await tx.timeline.update({ where: { id: timelineId }, data: { version: { increment: 1 } } });
        return { target: "event", eventId: payload.eventId, field: "description", previousValue };
      }

      const timeline = await tx.timeline.findUniqueOrThrow({ where: { id: timelineId } });
      const previousValue = timeline[field as "title" | "subtitle" | "description"];
      await tx.timeline.update({
        where: { id: timelineId },
        data: { [field]: payload.suggestedText, version: { increment: 1 } },
      });
      return { target: "timeline", field, previousValue };
    }

    case "visual_recommendation": {
      const timeline = await tx.timeline.findUniqueOrThrow({ where: { id: timelineId } });
      const previousLayout = timeline.layout;
      const previousTheme = timeline.theme;
      await tx.timeline.update({
        where: { id: timelineId },
        data: {
          layout: payload.layout ?? timeline.layout,
          theme: (payload.theme as Prisma.InputJsonValue | undefined) ?? timeline.theme ?? undefined,
          version: { increment: 1 },
        },
      });
      return { target: "timeline", previousLayout, previousTheme };
    }
  }
}

async function revertProposal(
  tx: Prisma.TransactionClient,
  timelineId: string,
  snapshot: Record<string, unknown>
): Promise<void> {
  if (Array.isArray(snapshot.createdEventIds)) {
    await tx.timelineEvent.deleteMany({ where: { id: { in: snapshot.createdEventIds as string[] } } });
    await tx.timeline.update({ where: { id: timelineId }, data: { version: { increment: 1 } } });
    return;
  }

  if (snapshot.target === "event" && typeof snapshot.eventId === "string") {
    await tx.timelineEvent.update({
      where: { id: snapshot.eventId },
      data: { description: (snapshot.previousValue as string | null) ?? null },
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

export async function acceptAiProposal(proposalId: string, viewer: ViewerContext) {
  const proposal = await loadPendingOrAcceptedProposal(proposalId, viewer);
  if (proposal.status !== "pending") {
    throw new ProposalStateError(`Cannot accept a proposal in "${proposal.status}" state.`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const snapshot = await applyProposal(tx, proposal.timelineId, proposal.payload as unknown as AiProposalPayload);
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
