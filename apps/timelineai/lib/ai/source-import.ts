import { createHash } from "node:crypto";

/**
 * Normalizes a pasted/uploaded/fetched source document into stable,
 * citable chunks before it's ever handed to a provider. Every extracted
 * event traces back to a chunk id here (see
 * ExtractedEventSchema#sourceChunkId in lib/ai/schemas.ts), and the whole
 * document's contentHash is what re-import dedupe keys off.
 */

export const SOURCE_IMPORT_KINDS = ["paste", "markdown", "csv", "json", "url"] as const;
export type SourceImportKind = (typeof SOURCE_IMPORT_KINDS)[number];

const MAX_CONTENT_LENGTH = 20_000; // matches the AI generation request cap (app/api/timelines/[id]/ai/proposals/route.ts)
const MAX_CHUNKS = 200;
const NULL_BYTE = String.fromCharCode(0);

export class UnsupportedSourceError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedSourceError";
  }
}

export interface SourceChunk {
  id: string;
  text: string;
}

export interface NormalizedSourceDocument {
  contentHash: string;
  chunks: SourceChunk[];
}

function assertSupported(content: string): void {
  if (content.includes(NULL_BYTE)) {
    throw new UnsupportedSourceError(
      "That file looks like a binary file - only text, Markdown, CSV, and JSON are supported."
    );
  }
  if (content.trim().length === 0) {
    throw new UnsupportedSourceError("That source is empty.");
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    throw new UnsupportedSourceError(
      `That source is too long (${content.length} characters, max ${MAX_CONTENT_LENGTH}). Try importing a smaller excerpt.`
    );
  }
}

function splitIntoParagraphChunks(content: string): string[] {
  return content
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

function splitIntoCsvRowChunks(content: string): string[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  // First line is treated as a header and kept out of the chunk set - it's
  // structure, not citable content on its own.
  return lines.slice(1).length > 0 ? lines.slice(1) : lines;
}

function splitIntoJsonChunks(content: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new UnsupportedSourceError("That doesn't look like valid JSON.");
  }
  if (Array.isArray(parsed)) {
    return parsed.map((item) => JSON.stringify(item));
  }
  return [JSON.stringify(parsed)];
}

function chunkText(content: string, kind: SourceImportKind): string[] {
  switch (kind) {
    case "csv":
      return splitIntoCsvRowChunks(content);
    case "json":
      return splitIntoJsonChunks(content);
    case "markdown":
    case "paste":
    case "url":
      return splitIntoParagraphChunks(content);
  }
}

export function hashContent(content: string): string {
  return createHash("sha256").update(content.trim()).digest("hex");
}

/**
 * `content` must already be plain text (URL import strips HTML before
 * calling this - see fetchUrlSource below). Chunk ids are derived from the
 * document hash + index, so the same document always produces the same
 * chunk ids - re-importing identical content yields identical citations,
 * which is what lets accept-time dedupe work.
 */
export function normalizeSourceDocument(content: string, kind: SourceImportKind): NormalizedSourceDocument {
  assertSupported(content);
  const contentHash = hashContent(content);

  const rawChunks = chunkText(content, kind).slice(0, MAX_CHUNKS);
  if (rawChunks.length === 0) {
    throw new UnsupportedSourceError("No content could be extracted from that source.");
  }

  const chunks = rawChunks.map((text, index) => ({
    id: createHash("sha256").update(`${contentHash}:${index}`).digest("hex").slice(0, 16),
    text: text.slice(0, 2000), // per-chunk cap independent of the whole-document cap
  }));

  return { contentHash, chunks };
}
