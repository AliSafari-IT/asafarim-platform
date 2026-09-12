import type { AiProvider, AiGenerationRequest } from "../provider";
import { parseGenerationResult } from "../provider";
import type { AiGenerationResult } from "../schemas";

/**
 * Deterministic, zero-network provider used in CI and local dev by default
 * (TIMELINEAI_AI_PROVIDER=fixture). Every response is built in-process from
 * the request alone — same input, same output, every run, and zero
 * billable model calls.
 */
function buildFixtureResult(request: AiGenerationRequest): AiGenerationResult {
  const model = { provider: "fixture", model: "fixture-v1", requestId: `fx-${request.kind}` };

  switch (request.kind) {
    case "events_extraction": {
      if (request.chunks && request.chunks.length > 0) {
        // Cited-import path: one event per source chunk, directly quoting
        // it as the citation excerpt — every event this branch produces is
        // traceable to the exact text it came from.
        const MAX_EVENTS_PER_IMPORT = 25;
        return {
          payload: {
            kind: "events_extraction",
            sourceContentHash: request.sourceContentHash,
            events: request.chunks.slice(0, MAX_EVENTS_PER_IMPORT).map((chunk) => ({
              title: chunk.text.slice(0, 80) || "Imported event",
              description: chunk.text.slice(0, 500),
              confidence: "medium" as const,
              sourceChunkId: chunk.id,
              uncitedInference: false,
              citations: [{ label: "Imported source", excerpt: chunk.text.slice(0, 500) }],
            })),
          },
          warnings: [],
          model,
        };
      }

      return {
        payload: {
          kind: "events_extraction",
          events: [
            {
              title: "Extracted event",
              description: request.sourceContent.slice(0, 200) || undefined,
              confidence: "medium",
              citations: [],
              uncitedInference: true,
            },
          ],
        },
        warnings: [],
        model,
      };
    }
    case "narrative_suggestion":
      return {
        payload: {
          kind: "narrative_suggestion",
          field: "description",
          suggestedText: "A clearer, fixture-generated description.",
          confidence: "medium",
        },
        warnings: [],
        model,
      };
    case "visual_recommendation":
      return {
        payload: {
          kind: "visual_recommendation",
          layout: "vertical",
          rationale: "Fixture recommendation: vertical suits most content lengths.",
          confidence: "low",
        },
        warnings: [],
        model,
      };
  }
}

export const fixtureProvider: AiProvider = {
  name: "fixture",
  async generate(request) {
    const raw = buildFixtureResult(request);
    // Routed through the same validation a real provider's output would
    // face, so the fixture provider also exercises the schema gate in CI.
    return parseGenerationResult(raw);
  },
};
