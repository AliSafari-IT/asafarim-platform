import { describe, expect, it } from "vitest";
import { FIXTURE_EMBEDDING_DIMENSIONS, fixtureEmbeddingProvider } from "./embeddings";

/**
 * Fixture provider determinism (JM-041). This is the only provider CI ever
 * calls, so its determinism and zero-network posture are load-bearing for
 * every cache/retry test built on top of it.
 */
describe("fixtureEmbeddingProvider", () => {
  it("is deterministic: the same text embeds to an identical vector every call", async () => {
    const [first] = await fixtureEmbeddingProvider.embed(["Senior Backend Engineer"]);
    const [second] = await fixtureEmbeddingProvider.embed(["Senior Backend Engineer"]);
    expect(second).toEqual(first);
  });

  it("produces a vector of the documented fixed dimension", async () => {
    const [vector] = await fixtureEmbeddingProvider.embed(["anything"]);
    expect(vector).toHaveLength(FIXTURE_EMBEDDING_DIMENSIONS);
  });

  it("produces different vectors for different text", async () => {
    const [a] = await fixtureEmbeddingProvider.embed(["Backend Engineer"]);
    const [b] = await fixtureEmbeddingProvider.embed(["Frontend Engineer"]);
    expect(b).not.toEqual(a);
  });

  it("batches in order: embed(texts) returns one vector per input, same order", async () => {
    const [single] = await fixtureEmbeddingProvider.embed(["only"]);
    const [first, second] = await fixtureEmbeddingProvider.embed(["only", "other"]);
    expect(first).toEqual(single);
    expect(second).not.toEqual(single);
  });

  it("every component is a finite number in [-1, 1] (free, offline, no network call)", async () => {
    const [vector] = await fixtureEmbeddingProvider.embed(["free and offline"]);
    for (const component of vector) {
      expect(Number.isFinite(component)).toBe(true);
      expect(component).toBeGreaterThanOrEqual(-1);
      expect(component).toBeLessThanOrEqual(1);
    }
  });

  it("reports its model version for provenance", () => {
    expect(fixtureEmbeddingProvider.modelVersion).toBe("fixture-1");
    expect(fixtureEmbeddingProvider.name).toBe("fixture");
  });
});
