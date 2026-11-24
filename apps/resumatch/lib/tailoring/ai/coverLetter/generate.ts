import { getEnv, type ResuMatchAiProvider } from "../../../env";
import { degradedReasonOf, type DegradedReason } from "../../degradedReason";
import { logError } from "../../../observability/logger";
import { buildCoverLetterContent, type CoverLetterContent, type CoverLetterSuggestion } from "./schema";
import { renderCoverLetterPrompt, type CoverLetterEvidenceInput, type CoverLetterLength, type CoverLetterTone } from "./prompts";
import type { OutputLanguage } from "../../language";
import { recordBilledFailure, recordUsage } from "../quota";
import { runProviderCallWithBudget } from "../../../ai/runProviderCall";
import { resolveFallbackProvider } from "../../../ai/fallbackProvider";
import type { CostAttribution } from "../../../costs/ledger";
import { getCoverLetterProvider, COVER_LETTER_MODEL_VERSIONS } from "./registry";
import { CoverLetterProviderError } from "./provider";
import { groundCoverLetterSuggestion } from "./grounding";

export interface CoverLetterProviderCallResult {
  /** null when the call degraded — nothing to review. Unlike tailoring,
   *  there is no "carried over unchanged" fallback for a letter: a
   *  degraded call simply produces no letter for this run. */
  suggestion: CoverLetterSuggestion | null;
  degraded: boolean;
  /** Issue #756: why there is no letter. `"grounding"`: the call worked
   *  but no paragraph survived the grounding check. Null when not degraded. */
  degradedReason: DegradedReason | "grounding" | null;
  promptVersion: string;
  /** The model and provider that served the call: the fallback's when the
   *  fallback served it (issue #511), else the primary's. */
  modelVersion: string;
  providerName: "fixture" | "openai" | "anthropic";
  /** What the grounding check took out, so the review screen can say so:
   *  sentences removed by the claim check, and paragraphs dropped by the
   *  name/number check (never overlapping). Zero when nothing was removed
   *  or the call degraded. */
  removedSentences: number;
  droppedParagraphs: number;
}

/**
 * The cover-letter provider-call step (issue #430, part of #453). Mirrors
 * `../generate.ts`'s `runTailorProviderCall` structure exactly — same
 * budget check (shared monthly ceiling, `"cover_letter"` kind), same
 * retry/degrade posture — applied to the cover-letter prompt/schema
 * instead. Returns the schema-validated suggestion after the grounding
 * check (`grounding.ts`, #529) has dropped anything ungrounded; turning
 * it into persisted content is `buildCoverLetterContent`'s job, called
 * separately once a caller knows the suggestion was actually approved
 * (see #454's review step).
 */
export async function runCoverLetterProviderCall(
  workspaceId: string,
  targetJobId: string,
  profileText: string,
  jobText: string,
  /** Issue #455. Both default inside renderCoverLetterPrompt when omitted. */
  tone?: CoverLetterTone,
  length?: CoverLetterLength,
  providerOverride?: "fixture" | "openai" | "anthropic",
  /** Issue #586 — same contract as runTailorProviderCall's `cost`. */
  cost: Partial<Pick<CostAttribution, "subjectType" | "subjectId" | "workflowId">> = {},
  /** #642 — the language to write the letter in; null for no rule. */
  outputLanguage: OutputLanguage | null = null,
  /** #928 — the application note the CV prompt also gets. */
  instructions: string | null = null,
  /** #929 — the confirmed evidence the CV prompt also gets, plus the
   *  candidate's motivation (letter only). */
  evidence: CoverLetterEvidenceInput | null = null,
): Promise<CoverLetterProviderCallResult> {
  const primaryName = providerOverride ?? getEnv().aiProvider;
  // Issue #511: RESUMATCH_AI_FALLBACK_PROVIDER, if set.
  const fallbackName = resolveFallbackProvider(primaryName);
  let providerName: ResuMatchAiProvider = primaryName;
  let modelVersion = COVER_LETTER_MODEL_VERSIONS[primaryName];
  const prompt = renderCoverLetterPrompt(profileText, jobText, tone, length, outputLanguage, instructions, evidence);

  let suggestion: CoverLetterSuggestion | null = null;
  let degraded = false;
  let degradedReason: DegradedReason | "grounding" | null = null;

  const attribution: CostAttribution = {
    subjectType: cost.subjectType ?? "target_job",
    subjectId: cost.subjectId ?? targetJobId,
    parentSubjectType: cost.subjectType && cost.subjectType !== "target_job" ? "target_job" : null,
    parentSubjectId: cost.subjectType && cost.subjectType !== "target_job" ? targetJobId : null,
    targetJobId,
    workflowId: cost.workflowId ?? null,
  };

  const result = await runProviderCallWithBudget({
    workspaceId,
    kind: "cover_letter",
    prepare: async () => ({ provider: await getCoverLetterProvider(primaryName), name: primaryName, modelVersion: COVER_LETTER_MODEL_VERSIONS[primaryName] }),
    fallback: fallbackName
      ? {
          prepare: async () => ({
            provider: await getCoverLetterProvider(fallbackName),
            name: fallbackName,
            modelVersion: COVER_LETTER_MODEL_VERSIONS[fallbackName],
          }),
          // Unknown errors are retried, but only a provider failure is worth
          // a second provider: never a failed spend write after a success.
          isEligible: (err: unknown) => err instanceof CoverLetterProviderError && err.retryable,
        }
      : null,
    call: async ({ provider, name, modelVersion }) => {
      const started = Date.now();
      const output = await provider.generate({
        profileText,
        jobText: prompt.jobTextUsed,
        system: prompt.system,
        user: prompt.user,
        promptVersion: prompt.version,
        model: modelVersion,
        instructions: prompt.instructionsUsed,
      });
      await recordUsage({
        workspaceId,
        kind: "cover_letter",
        provider: name,
        model: modelVersion,
        promptVersion: prompt.version,
        inputTokens: output.inputTokens,
        outputTokens: output.outputTokens,
        meta: output,
        latencyMs: Date.now() - started,
        attribution,
      });
      return { suggestion: output.suggestion, name, modelVersion };
    },
    onAttemptFailed: async (err, { name, modelVersion }, attempt) => {
      await recordBilledFailure(err, { workspaceId, kind: "cover_letter", provider: name, model: modelVersion, promptVersion: prompt.version, attribution });
      logError("coverLetter.generate.provider_call_failed", err, { workspaceId, targetJobId, attempt, provider: name });
    },
    isRetryable: (err) => (err instanceof CoverLetterProviderError ? err.retryable : true),
  });

  if (result.ok) {
    suggestion = result.value.suggestion;
    providerName = result.value.name;
    modelVersion = result.value.modelVersion;
  } else {
    logError("coverLetter.generate.degraded", result.error, { workspaceId, targetJobId, provider: providerName });
    degraded = true;
    degradedReason = degradedReasonOf(result.error);
    suggestion = null;
  }

  // Issue #529: the structural half of the prompt's no-fabrication rule.
  // Checked against the full profile and job text (see grounding.ts).
  // A letter with no grounded paragraph left degrades the same way a failed
  // call does — the provider call was still billed above.
  let removedSentences = 0;
  let droppedParagraphs = 0;
  if (suggestion) {
    // #929: confirmed professional evidence backs claims like the profile
    // does. Motivation only lets its own names and numbers through: wanting
    // to mentor is not having mentored, so it never backs a claim.
    const groundingText = [profileText, prompt.evidenceUsed].filter(Boolean).join("\n");
    const grounded = groundCoverLetterSuggestion(suggestion, groundingText, jobText, outputLanguage, prompt.motivationUsed);
    suggestion = grounded.suggestion;
    removedSentences = grounded.removedClaimSentences;
    droppedParagraphs = grounded.tokenDroppedParagraphs;
    if (!suggestion) {
      degraded = true;
      degradedReason = "grounding";
    }
  }

  return { suggestion, degraded, degradedReason, promptVersion: prompt.version, modelVersion, providerName, removedSentences, droppedParagraphs };
}

export { buildCoverLetterContent };
export type { CoverLetterContent };
