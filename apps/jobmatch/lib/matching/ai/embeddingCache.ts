import { createHash, randomUUID } from "node:crypto";
import { getJobmatchDb } from "../../db/client";
import type { PrismaClient } from "../../db/generated";
import { logError } from "../../observability/logger";
import { parseProfileContent, type CandidateProfileContent } from "../../profile/contract";
import { buildEmbeddingInput } from "../embeddingInput";
import { getEmbeddingProvider, type EmbeddingProvider } from "./embeddings";

/**
 * Embedding compute + content-hash cache (JM-041).
 *
 * The cache key is `sha256(embeddingModelVersion + text)`. `text` is:
 *  - for a profile, ONLY `buildEmbeddingInput(profile).text`
 *    (lib/matching/embeddingInput.ts) — see `embeddingTextForProfile` below,
 *    the single choke point every profile embed call goes through. Never
 *    raw profile content.
 *  - for a posting, the normalised (whitespace-collapsed) description.
 *
 * A cache row is recomputed only when its stored hash differs from the
 * freshly computed one ("invalidate only changed content") — re-confirming
 * a profile whose professional facts did not change reuses the existing
 * vector with no embed call at all.
 *
 * One row per (workspaceId, kind, sourceId, embeddingModelVersion) — see the
 * `MatchEmbedding` Prisma model. `sourceId` is the stable `CandidateProfile`
 * id for a profile (not the version id: versions are immutable and rotate
 * per correction, but the cache tracks "this profile's current embedding",
 * updated in place as its confirmed content changes) or the `JobPosting` id
 * for a posting.
 *
 * `vector` is a pgvector column, modelled in Prisma as `Unsupported(...)`
 * (see schema.prisma), so every read/write here goes through raw SQL rather
 * than the normal Prisma Client API.
 *
 * Deliberately no `import "server-only"` here, like lib/db/client.ts: this
 * module is imported directly by worker/index.ts (a plain Node/tsx process,
 * never bundled by Next.js), and `server-only`'s package resolution fails
 * outside Next.js's build (issue #363). Client-side exposure is already
 * prevented by this only ever being reachable from Route Handlers/Server
 * Components/the worker.
 */

/**
 * A posting is not candidate-specific: unlike a profile embedding, it is
 * meant to be computed once and reused by every workspace that might match
 * against it. `MatchEmbedding.workspaceId` is still a required, non-null
 * column (matching the unique key the issue specifies), so posting rows use
 * this constant rather than `null` — Postgres treats `NULL` as distinct from
 * itself in a unique index, which would silently defeat the cache.
 */
export const GLOBAL_EMBEDDING_WORKSPACE_ID = "global";

export type EmbeddingKind = "PROFILE" | "POSTING";

export interface EnsuredEmbedding {
  id: string;
  /** True when the existing cached row was reused — no embed() call was made. */
  reused: boolean;
  modelVersion: string;
  contentHash: string;
}

/**
 * The only text a profile embedding call may ever receive: exactly
 * `buildEmbeddingInput`'s output, never anything else derived from the
 * profile. Kept as its own named function (rather than inlined) so a unit
 * test can assert every embed call for a profile funnels through here —
 * see embeddingCache.test.ts.
 */
export function embeddingTextForProfile(content: CandidateProfileContent): string {
  return buildEmbeddingInput(content).text;
}

/** Whitespace-collapsed job posting description — the only text a posting embedding call may receive. */
export function embeddingTextForPosting(description: string): string {
  return description.replace(/\s+/g, " ").trim();
}

function contentHashOf(modelVersion: string, text: string): string {
  return createHash("sha256").update(`${modelVersion}::${text}`).digest("hex");
}

/**
 * Ensure a workspace's confirmed profile has an up-to-date cached embedding.
 * Returns `null` when the workspace has no confirmed profile version yet —
 * matching only ever reads confirmed content (lib/profile/versions.ts), and
 * an embedding for unreviewed extraction output must never exist either.
 */
export async function ensureProfileEmbedding(
  workspaceId: string,
  profileId: string,
  provider: EmbeddingProvider = getEmbeddingProvider(),
): Promise<EnsuredEmbedding | null> {
  const db = getJobmatchDb();

  const profile = await db.candidateProfile.findFirst({
    where: { id: profileId, workspaceId },
    select: { confirmedVersionId: true },
  });
  if (!profile?.confirmedVersionId) return null;

  const version = await db.candidateProfileVersion.findUnique({
    where: { id: profile.confirmedVersionId },
    select: { content: true },
  });
  if (!version) return null;

  const content = parseProfileContent(version.content);
  const text = embeddingTextForProfile(content);

  return ensureEmbeddingRow({
    workspaceId,
    kind: "PROFILE",
    sourceId: profileId,
    text,
    provider,
  });
}

/**
 * Ensure a job posting has an up-to-date cached embedding. Returns `null`
 * when the posting does not exist.
 */
export async function ensurePostingEmbedding(
  jobPostingId: string,
  provider: EmbeddingProvider = getEmbeddingProvider(),
): Promise<EnsuredEmbedding | null> {
  const db = getJobmatchDb();

  const posting = await db.jobPosting.findUnique({
    where: { id: jobPostingId },
    select: { description: true },
  });
  if (!posting) return null;

  const text = embeddingTextForPosting(posting.description);

  return ensureEmbeddingRow({
    workspaceId: GLOBAL_EMBEDDING_WORKSPACE_ID,
    kind: "POSTING",
    sourceId: jobPostingId,
    text,
    provider,
  });
}

interface EnsureRowInput {
  workspaceId: string;
  kind: EmbeddingKind;
  sourceId: string;
  text: string;
  provider: EmbeddingProvider;
}

async function ensureEmbeddingRow(input: EnsureRowInput): Promise<EnsuredEmbedding> {
  const { workspaceId, kind, sourceId, text, provider } = input;
  const contentHash = contentHashOf(provider.modelVersion, text);

  const existing = await findEmbeddingRow(workspaceId, kind, sourceId, provider.modelVersion);
  if (existing && existing.contentHash === contentHash) {
    return { id: existing.id, reused: true, modelVersion: provider.modelVersion, contentHash };
  }

  const [vector] = await embedWithRetry(provider, [text]);
  const id = await upsertEmbeddingRow({
    id: existing?.id,
    workspaceId,
    kind,
    sourceId,
    modelVersion: provider.modelVersion,
    contentHash,
    vector,
  });

  return { id, reused: false, modelVersion: provider.modelVersion, contentHash };
}

/**
 * Retry a failed batch embed call a bounded number of times. Failures are
 * logged (never the input text — see lib/observability/logger.ts's
 * `logError`) and the last error re-thrown once attempts are exhausted, so a
 * persistent provider outage surfaces rather than silently producing no
 * embedding.
 */
async function embedWithRetry(
  provider: EmbeddingProvider,
  texts: string[],
  attempts = 3,
): Promise<number[][]> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await provider.embed(texts);
    } catch (error) {
      lastError = error;
      logError("embedding.provider_call_failed", error, {
        attempt,
        batchSize: texts.length,
        provider: provider.name,
      });
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Embedding provider call failed after retries");
}

interface EmbeddingRow {
  id: string;
  contentHash: string;
}

async function findEmbeddingRow(
  workspaceId: string,
  kind: EmbeddingKind,
  sourceId: string,
  modelVersion: string,
): Promise<EmbeddingRow | null> {
  const db = getJobmatchDb();
  const rows = await db.$queryRaw<EmbeddingRow[]>`
    SELECT "id", "contentHash"
    FROM "match_embeddings"
    WHERE "workspaceId" = ${workspaceId}
      AND "kind" = ${kind}::"EmbeddingKind"
      AND "sourceId" = ${sourceId}
      AND "embeddingModelVersion" = ${modelVersion}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

interface UpsertRowInput {
  id: string | undefined;
  workspaceId: string;
  kind: EmbeddingKind;
  sourceId: string;
  modelVersion: string;
  contentHash: string;
  vector: number[];
}

async function upsertEmbeddingRow(input: UpsertRowInput): Promise<string> {
  const db = getJobmatchDb();
  const id = input.id ?? randomUUID();
  const vectorLiteral = `[${input.vector.join(",")}]`;

  await db.$executeRaw`
    INSERT INTO "match_embeddings"
      ("id", "workspaceId", "kind", "sourceId", "embeddingModelVersion", "contentHash", "vector", "createdAt", "updatedAt")
    VALUES
      (${id}, ${input.workspaceId}, ${input.kind}::"EmbeddingKind", ${input.sourceId}, ${input.modelVersion}, ${input.contentHash}, ${vectorLiteral}::vector, now(), now())
    ON CONFLICT ("workspaceId", "kind", "sourceId", "embeddingModelVersion")
    DO UPDATE SET
      "contentHash" = EXCLUDED."contentHash",
      "vector" = EXCLUDED."vector",
      "updatedAt" = now()
  `;

  return id;
}

/**
 * Delete every profile embedding for a workspace (GDPR erasure, JM-023).
 * Posting embeddings are never workspace-scoped derived data — they are not
 * candidate-specific and are shared across every workspace that might match
 * against the same posting — so erasure never touches them.
 *
 * Takes a transaction client so the caller (lib/profile/dataRights.ts) can
 * run this in the same transaction as the rest of the erasure sequence,
 * before the `CandidateProfile` row itself is deleted.
 */
export async function deleteProfileEmbeddings(
  tx: Pick<PrismaClient, "$executeRaw">,
  workspaceId: string,
): Promise<number> {
  const result = await tx.$executeRaw`
    DELETE FROM "match_embeddings"
    WHERE "workspaceId" = ${workspaceId} AND "kind" = 'PROFILE'::"EmbeddingKind"
  `;
  return typeof result === "number" ? result : Number(result);
}
