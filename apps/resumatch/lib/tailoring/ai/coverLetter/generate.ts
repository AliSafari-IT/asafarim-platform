import { getEnv } from "../../../env";
import { logError } from "../../../observability/logger";
import { buildCoverLetterContent, type CoverLetterContent, type CoverLetterSuggestion } from "./schema";
import { renderCoverLetterPrompt, type CoverLetterLength, type CoverLetterTone } from "./prompts";
import type { OutputLanguage } from "../../language";
import { assertCanRunProviderCall, recordBilledFailure, recordUsage } from "../quota";
import type { CostAttribution } from "../../../costs/ledger";
import { getCoverLetterProvider, COVER_LETTER_MODEL_VERSIONS } from "./registry";
import { CoverLetterProviderError } from "./provider";

const MAX_ATTEMPTS = 3;

export interface CoverLetterProviderCallResult {
  /** null when the call degraded — nothing to review. Unlike tailoring,
   *  there is no "carried over unchanged" fallback for a letter: a
   *  degraded call simply produces no letter for this run. */
  suggestion: CoverLetterSuggestion | null;
  degraded: boolean;
  promptVersion: string;
  modelVersion: string;
  providerName: "fixture" | "openai" | "anthropic";
}

/**
 * The cover-letter provider-call step (issue #430, part of #453). Mirrors
 * `../generate.ts`'s `runTailorProviderCall` structure exactly — same
 * budget check (shared monthly ceiling, `"cover_letter"` kind), same
 * retry/degrade posture — applied to the cover-letter prompt/schema
 * instead. Returns the raw (already schema-validated) suggestion; turning
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
): Promise<CoverLetterProviderCallResult> {
  const providerName = providerOverride ?? getEnv().aiProvider;
  const modelVersion = COVER_LETTER_MODEL_VERSIONS[providerName];
  const prompt = renderCoverLetterPrompt(profileText, jobText, tone, length, outputLanguage);

  let suggestion: CoverLetterSuggestion | null = null;
  let degraded = false;

  const attribution: CostAttribution = {
    subjectType: cost.subjectType ?? "target_job",
    subjectId: cost.subjectId ?? targetJobId,
    parentSubjectType: cost.subjectType && cost.subjectType !== "target_job" ? "target_job" : null,
    parentSubjectId: cost.subjectType && cost.subjectType !== "target_job" ? targetJobId : null,
    targetJobId,
    workflowId: cost.workflowId ?? null,
  };

  try {
    await assertCanRunProviderCall(workspaceId, "cover_letter");
    const provider = await getCoverLetterProvider(providerName);

    for (let attempt = 1; ; attempt++) {
      try {
        const started = Date.now();
        const output = await provider.generate({
          profileText,
          jobText: prompt.jobTextUsed,
          system: prompt.system,
          user: prompt.user,
          promptVersion: prompt.version,
          model: modelVersion,
        });
        await recordUsage({
          workspaceId,
          kind: "cover_letter",
          provider: providerName,
          model: modelVersion,
          promptVersion: prompt.version,
          inputTokens: output.inputTokens,
          outputTokens: output.outputTokens,
          meta: output,
          latencyMs: Date.now() - started,
          attribution,
        });
        suggestion = output.suggestion;
        break;
      } catch (err) {
        await recordBilledFailure(err, { workspaceId, kind: "cover_letter", provider: providerName, model: modelVersion, promptVersion: prompt.version, attribution });
        const retryable = err instanceof CoverLetterProviderError ? err.retryable : true;
        logError("coverLetter.generate.provider_call_failed", err, { workspaceId, targetJobId, attempt, provider: providerName });
        if (attempt >= MAX_ATTEMPTS || !retryable) throw err;
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
      }
    }
  } catch (error) {
    logError("coverLetter.generate.degraded", error, { workspaceId, targetJobId, provider: providerName });
    degraded = true;
    suggestion = null;
  }

  return { suggestion, degraded, promptVersion: prompt.version, modelVersion, providerName };
}

export { buildCoverLetterContent };
export type { CoverLetterContent };
