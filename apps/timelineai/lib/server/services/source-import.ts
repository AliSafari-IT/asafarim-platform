import "server-only";
import { prisma, type Prisma } from "../db";
import { assertAccess, NotFoundError, type ViewerContext } from "../authz";
import { normalizeSourceDocument, UnsupportedSourceError, type SourceImportKind } from "../../ai/source-import";
import { fetchUrlSource } from "./url-source-fetch";
import { generateAiProposal } from "./ai-proposals";

export interface ImportSourceInput {
  kind: SourceImportKind;
  /** Raw pasted/uploaded text. Ignored (and required to be absent) for kind "url". */
  content?: string;
  /** Source URL. Required for, and only valid with, kind "url". */
  url?: string;
  /** Filename or other human label, display-only. */
  label?: string;
}

async function loadTimelineForEdit(timelineId: string, viewer: ViewerContext) {
  const timeline = await prisma.timeline.findUnique({ where: { id: timelineId } });
  if (!timeline) throw new NotFoundError("That timeline doesn't exist.");
  assertAccess(timeline, viewer, "edit");
  return timeline;
}

/**
 * Normalizes a source (paste/file/URL) into citable chunks, records the
 * import for dedupe/provenance, and generates an events_extraction
 * proposal from it. Re-importing content with an identical hash reuses the
 * existing TimelineSourceImport row rather than creating a second one —
 * proposal generation still runs, so the user gets fresh suggestions, but
 * accept-time dedupe (see ai-proposals.ts#applyProposal) is what actually
 * stops duplicate events from a repeat import + accept.
 */
export async function importSource(timelineId: string, viewer: ViewerContext, input: ImportSourceInput) {
  await loadTimelineForEdit(timelineId, viewer);

  const rawContent = input.kind === "url" ? await fetchUrlSource(requireUrl(input)) : requireContent(input);

  const { contentHash, chunks } = normalizeSourceDocument(rawContent, input.kind);

  // Checked before the upsert so the caller can tell "this exact document
  // was already imported before" apart from "first time seeing this" —
  // the upsert alone can't distinguish the two branches it took.
  const existingImport = await prisma.timelineSourceImport.findUnique({
    where: { timelineId_contentHash: { timelineId, contentHash } },
    select: { id: true },
  });

  const sourceImport = await prisma.timelineSourceImport.upsert({
    where: { timelineId_contentHash: { timelineId, contentHash } },
    create: {
      timelineId,
      kind: input.kind,
      contentHash,
      sourceLabel: input.label ?? (input.kind === "url" ? input.url : null) ?? null,
      chunkCount: chunks.length,
      createdByUserId: viewer.userId,
    },
    update: {}, // identical content already recorded — leave the original createdAt/createdBy
  });

  // Chunks that already produced an accepted event on a prior import of
  // this same document — surfaced to the review UI so "already imported"
  // is visible per-event, not just enforced silently at accept time (see
  // applyProposal's events_extraction dedupe in ai-proposals.ts).
  const alreadyImportedRows = await prisma.timelineImportedEvent.findMany({
    where: { timelineId, contentHash, chunkId: { in: chunks.map((c) => c.id) } },
    select: { chunkId: true },
  });

  const combinedText = chunks.map((c) => c.text).join("\n\n");
  const proposal = await generateAiProposal(timelineId, viewer, "events_extraction", combinedText, {
    chunks,
    sourceContentHash: contentHash,
  });

  return {
    sourceImport,
    proposal,
    wasReimport: !!existingImport,
    alreadyImportedChunkIds: alreadyImportedRows.map((r) => r.chunkId),
  };
}

function requireContent(input: ImportSourceInput): string {
  if (!input.content) throw new UnsupportedSourceError("Source content is required."); // shouldn't happen past API-layer validation
  return input.content;
}

function requireUrl(input: ImportSourceInput): string {
  if (!input.url) throw new UnsupportedSourceError("A URL is required."); // shouldn't happen past API-layer validation
  return input.url;
}

export type { Prisma };
