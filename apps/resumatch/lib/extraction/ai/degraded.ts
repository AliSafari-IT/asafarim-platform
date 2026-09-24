import { logError } from "../../observability/logger";
import { getEnv, type ResuMatchAiProvider } from "../../env";
import type { ProfileConfidence } from "../../profile/contract";
import {
  PROFILE_EXTRACTOR_NAME,
  PROFILE_EXTRACTOR_VERSION,
  extractProfileFromText,
  type ExtractedProfile,
} from "../profileExtractor";
import {
  assertCanRunProviderCall,
  recordBilledFailure,
  settleProviderCall,
  QuotaExceededError,
} from "../../tailoring/ai/quota";
import type { CostAttribution } from "../../costs/ledger";
import { renderExtractPrompt } from "./prompts";
import { ExtractionProviderError } from "./provider";
import { EXTRACT_MODEL_VERSIONS, getExtractionProvider } from "./registry";
import { mergeAiExtraction, parseAiExtractionOutput } from "./schema";
import { groundExperienceSummaries } from "./grounding";

/**
 * Degraded-mode wiring for CV extraction. Mirrors
 * lib/tailoring/ai/degraded.ts's `runOrDegrade` role: the single funnel
 * every extraction call site goes through — budget exhaustion, retries
 * exhausted, or a response that fails schema validation all end up here,
 * and all of them fall back to the deterministic extractor
 * (lib/extraction/profileExtractor.ts) — never a 500, never a blank
 * profile shown as if it were successfully read.
 *
 * Unlike tailoring's degrade path (which falls back to "the profile
 * unchanged"), there is no prior profile to fall back to on a first
 * upload — the fallback here is the deterministic extractor's own result,
 * exactly what ran before AI extraction existed. `RESUMATCH_AI_PROVIDER`
 * defaults to `fixture` everywhere, so in practice this function's
 * "try AI, degrade to deterministic" shape only does anything once a real
 * provider is explicitly configured (still gated by JM-005 in any
 * deployed environment — see issue #419).
 */

export interface ExtractionOutcome extends ExtractedProfile {
  extractorName: string;
  extractorVersion: string;
  /** True when the deterministic extractor produced this result — either
   *  because that's the only extractor configured (`fixture`), or because
   *  a real provider call failed/exhausted its budget/retries. */
  degraded: boolean;
}

const MAX_ATTEMPTS = 3;

/** AI extraction doesn't produce calibrated per-field confidence scores.
 *  Every field it actually populated is scored at the same tier as the
 *  deterministic extractor's "found under an explicit section" tier
 *  (CONFIDENCE.section in profileExtractor.ts) — read from real document
 *  context, not a positional guess, but not a regex-certain pattern match
 *  either. */
const AI_FIELD_CONFIDENCE = 0.8;

function confidenceFor(content: ReturnType<typeof mergeAiExtraction>): ProfileConfidence {
  const confidence: ProfileConfidence = {};
  for (const [key, value] of Object.entries(content)) {
    if (key === "preferences" || key === "workAuthorization" || key === "contractVersion") continue;
    const populated = Array.isArray(value) ? value.length > 0 : value !== null;
    if (populated) confidence[key] = AI_FIELD_CONFIDENCE;
  }
  return confidence;
}

function deterministic(text: string): ExtractionOutcome {
  const result = extractProfileFromText(text);
  return {
    ...result,
    extractorName: PROFILE_EXTRACTOR_NAME,
    extractorVersion: PROFILE_EXTRACTOR_VERSION,
    degraded: true,
  };
}

/**
 * Extract a profile from CV text, trying the configured AI provider first
 * (budget-checked, retried on retryable failures) and falling back to the
 * deterministic extractor on any failure. Never throws — a caller can treat
 * this as the extraction step, full stop.
 */
export async function extractProfileWithFallback(
  workspaceId: string,
  text: string,
  opts: {
    provider?: ResuMatchAiProvider;
    /** The CandidateDocument being extracted (issue #586). */
    documentId?: string;
  } = {},
): Promise<ExtractionOutcome> {
  const aiProvider = opts.provider ?? getEnv().aiProvider;
  const attribution: CostAttribution = {
    subjectType: "candidate_document",
    subjectId: opts.documentId ?? workspaceId,
  };

  // `fixture` is the default everywhere and must behave EXACTLY as it did
  // before AI extraction existed — same confidence scores, same
  // layoutReliable semantics, no budget/ledger writes for what is by
  // design a free, offline path. Routing it through the AI round-trip
  // (ExtractionFixtureProvider reshapes the same result and this module
  // would then re-score confidence flatly) would silently change existing
  // behavior for every candidate who has never touched
  // RESUMATCH_AI_PROVIDER. Only an explicitly configured real provider
  // takes the AI path below.
  if (aiProvider === "fixture") return deterministic(text);

  try {
    await assertCanRunProviderCall(workspaceId, "extract");

    const provider = await getExtractionProvider(aiProvider);
    const modelVersion = EXTRACT_MODEL_VERSIONS[aiProvider];
    const prompt = renderExtractPrompt(text);

    for (let attempt = 1; ; attempt++) {
      try {
        const started = Date.now();
        const output = await provider.extract({
          text,
          system: prompt.system,
          user: prompt.user,
          promptVersion: prompt.version,
          model: modelVersion,
        });

        // A response that doesn't match the schema is a failed call, not a
        // partial apply — thrown here so it degrades below, same as a
        // provider-level failure. Never retried: the same malformed shape
        // would recur against the same input.
        //
        // groundExperienceSummaries runs on the already-validated content,
        // dropping any per-role highlight that mentions a technology,
        // employer, or number not traceable back to the source CV text —
        // see grounding.ts's doc comment for why this check exists
        // alongside the prompt's own no-fabrication rules (issue #420).
        const content = await settleProviderCall(
          {
            workspaceId,
            kind: "extract",
            provider: aiProvider,
            model: modelVersion,
            promptVersion: prompt.version,
            inputTokens: output.inputTokens,
            outputTokens: output.outputTokens,
            meta: output,
            latencyMs: Date.now() - started,
            attribution,
          },
          () => groundExperienceSummaries(mergeAiExtraction(parseAiExtractionOutput(output.data)), text),
        );

        return {
          content,
          confidence: confidenceFor(content),
          // AI reads the whole document at once rather than depending on
          // section-splitting by reading order, so the deterministic
          // extractor's "layout could not be read" caveat does not apply.
          layoutReliable: true,
          extractorName: `${PROFILE_EXTRACTOR_NAME}-ai`,
          extractorVersion: `${aiProvider}:${modelVersion}:${prompt.version}`,
          degraded: false,
        };
      } catch (err) {
        await recordBilledFailure(err, { workspaceId, kind: "extract", provider: aiProvider, model: modelVersion, promptVersion: prompt.version, attribution });
        const retryable = err instanceof ExtractionProviderError ? err.retryable : false;
        logError("extraction.ai.provider_call_failed", err, { workspaceId, attempt, provider: aiProvider });
        if (attempt >= MAX_ATTEMPTS || !retryable) throw err;
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
      }
    }
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      logError("extraction.ai.degraded.budget_exhausted", error, { workspaceId, reason: error.reason });
    } else {
      logError("extraction.ai.degraded.provider_call_failed", error, { workspaceId });
    }
    return deterministic(text);
  }
}
