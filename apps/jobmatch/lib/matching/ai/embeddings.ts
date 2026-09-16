import { createHash } from "node:crypto";
import { getEnv, type JobMatchAiProvider } from "../../env";

/**
 * Embedding provider boundary (JM-041).
 *
 * `embed()` takes plain text -- never a profile or posting object -- and
 * returns one vector per input, in order. `modelVersion` travels with every
 * result so a cache row (see ./embeddingCache.ts) and, later, a MatchResult
 * (lib/matching/contract.ts's `embeddingModelVersion`) can say exactly what
 * produced them.
 *
 * Mirrors `apps/tasks-ai/lib/ai/providers/fixture.ts`'s shape: a
 * deterministic, zero-cost, network-free `fixture` provider is the only one
 * CI or the test suite ever calls, selected via `JOBMATCH_AI_PROVIDER`
 * (lib/env.ts, JM-005-gated for any deployed environment). Real adapters are
 * plain files under ./providers/ imported lazily -- `getEmbeddingProvider()`
 * never touches an SDK module unless a non-fixture provider is actually
 * selected, so importing this module costs nothing and needs no API key.
 */

export interface EmbeddingProvider {
  readonly name: JobMatchAiProvider;
  readonly modelVersion: string;
  embed(texts: string[]): Promise<number[][]>;
}

/**
 * Vector width for the fixture provider. 384 mirrors common small
 * sentence-embedding models (e.g. all-MiniLM-L6-v2), which is a reasonable
 * stand-in dimension for exercising the pgvector column and downstream
 * ranking code without a real model — the fixture provider makes no claim to
 * semantic accuracy, only to a stable, reproducible shape.
 */
export const FIXTURE_EMBEDDING_DIMENSIONS = 384;

/**
 * Deterministic, offline provider. Same text -> identical vector, every
 * call, $0 cost, no network. This is the only provider CI or the fixture
 * test suite ever exercises.
 *
 * Each vector component comes from successive SHA-256 digests of the input
 * text (each digest seeded with its own chunk index so they never repeat),
 * with each byte mapped from [0, 255] to a float in [-1, 1]. Not a semantic
 * embedding — a stable fingerprint, which is all a cache/retry/storage test
 * needs.
 */
export const fixtureEmbeddingProvider: EmbeddingProvider = {
  name: "fixture",
  modelVersion: "fixture-1",
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(hashToVector);
  },
};

function hashToVector(text: string): number[] {
  const vector: number[] = [];
  let chunkIndex = 0;
  while (vector.length < FIXTURE_EMBEDDING_DIMENSIONS) {
    const digest = createHash("sha256").update(`${text}::${chunkIndex}`).digest();
    for (const byte of digest) {
      if (vector.length >= FIXTURE_EMBEDDING_DIMENSIONS) break;
      vector.push(Number((((byte / 255) * 2 - 1)).toFixed(6)));
    }
    chunkIndex += 1;
  }
  return vector;
}

/**
 * Resolve the embedding provider from `JOBMATCH_AI_PROVIDER`. `fixture` is
 * the default and the only provider ever reached in CI/tests. `openai` and
 * `anthropic` are lazily-imported minimal stubs (see ./providers/) that
 * throw until a real adapter is implemented — selecting either one in a
 * deployed environment additionally requires the JM-005 sign-off gate in
 * lib/env.ts, which this function does not re-check: `getEnv()` already
 * refused to resolve at boot if that gate was not satisfied.
 */
export function getEmbeddingProvider(): EmbeddingProvider {
  const { aiProvider } = getEnv();
  if (aiProvider === "fixture") return fixtureEmbeddingProvider;

  return {
    name: aiProvider,
    modelVersion: `${aiProvider}-unconfigured`,
    async embed(texts: string[]): Promise<number[][]> {
      if (aiProvider === "openai") {
        const { openaiEmbed } = await import("./providers/openai");
        return openaiEmbed(texts);
      }
      const { anthropicEmbed } = await import("./providers/anthropic");
      return anthropicEmbed(texts);
    },
  };
}
