import type { AiProvider, AiGenerationRequest } from "../provider";
import { parseGenerationResult, AiProviderError } from "../provider";
import type { AiGenerationResult } from "../schemas";
import { parseTemporalPhrase } from "../temporal-parse";
import { recommendVisualDirections, type ContentSummary } from "../visual-director";

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
    case "narrative_suggestion": {
      const target = request.narrativeTarget;
      const field = target?.field ?? "description";
      // A target field with nothing written yet (currentText === "") has no
      // text to rewrite — fall back to the requester's own sourceContent so
      // the fixture still has material to work from, instead of producing
      // variants built from an empty string (which fails NarrativeVariantSchema's
      // min(1) on the "concise" variant, which echoes `original` verbatim).
      const original = (target?.currentText?.trim() ? target.currentText : request.sourceContent).trim();

      // Every variant wraps the original text verbatim rather than
      // rewording it away — a real provider must pass preservesFactualAnchors()
      // itself, but the fixture guarantees it by construction so the
      // variant-storage and audience-preset plumbing is exercised safely.
      const variants = [
        { variant: "concise" as const, text: original },
        { variant: "standard" as const, text: `Here's the story: ${original}` },
        { variant: "immersive" as const, text: `Picture this — ${original} And that's just the beginning.` },
      ];

      return {
        payload: {
          kind: "narrative_suggestion",
          eventId: target?.eventId,
          field,
          element: "field_rewrite",
          audiencePreset: target?.audiencePreset,
          suggestedText: variants[1]!.text, // "standard" is the default applied variant
          variants,
          rationale: "Fixture rewrite: same facts, lightly reframed.",
          confidence: "medium",
          unsupportedClaim: false,
        },
        warnings: [],
        model,
      };
    }
    case "visual_recommendation": {
      const summary: ContentSummary = request.contentSummary ?? {
        eventCount: 10,
        hasDurations: false,
        hasManyBranches: false,
        avgDescriptionLength: 50,
      };
      const directions = recommendVisualDirections(summary);
      if (directions.length < 2) {
        // Every heuristic candidate already passed the accessibility gate
        // (visual-director.ts never returns one that didn't) — fewer than
        // 2 surviving means the token set itself can't cover this content,
        // which is a provider_failure, not a partial/degraded proposal.
        throw new AiProviderError("Could not produce enough accessible visual-direction candidates.");
      }
      return {
        payload: {
          kind: "visual_recommendation",
          candidates: directions.map((d) => ({
            layout: d.layout,
            backgroundId: d.backgroundId,
            accentId: d.accentId,
            density: d.density,
            cardStyle: d.cardStyle,
            rationale: d.rationale,
          })),
          recommendedIndex: 0,
          confidence: "medium",
        },
        warnings: [],
        model,
      };
    }
    case "temporal_correction": {
      if (!request.targetEventId) {
        throw new AiProviderError("temporal_correction requires a targetEventId.");
      }
      const temporalValue = parseTemporalPhrase(request.sourceContent);
      // Honest about uncertainty: an unrecognized phrase is surfaced as an
      // uncited inference rather than guessing a precision it didn't earn.
      const recognized = temporalValue.precision !== "unknown";
      return {
        payload: {
          kind: "temporal_correction",
          eventId: request.targetEventId,
          temporalValue,
          confidence: recognized ? "medium" : "low",
          uncitedInference: !recognized,
          citations: recognized ? [{ label: "Source phrase", excerpt: request.sourceContent.slice(0, 500) }] : [],
          conflictCodes: [],
        },
        warnings: recognized
          ? []
          : [{ code: "unrecognized_phrase", message: "Could not confidently parse a date from this text." }],
        model,
      };
    }
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
