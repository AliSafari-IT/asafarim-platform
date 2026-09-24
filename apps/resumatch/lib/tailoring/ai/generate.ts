import { randomUUID } from "node:crypto";
import { getJobmatchDb } from "../../db/client";
import { getEnv } from "../../env";
import { logError } from "../../observability/logger";
import type { CandidateProfileContent } from "../../profile/contract";
import { getVersion } from "../../profile/versions";
import { buildProfileText } from "../buildProfileText";
import { renderTailorPrompt } from "./prompts";
import { assertCanRunProviderCall, recordBilledFailure, recordUsage } from "./quota";
import type { CostAttribution } from "../../costs/ledger";
import { getTailorProvider, resolveTailorModelVersion } from "./registry";
import { mergeTailoringSuggestions, type TailoredResumeContent, type TailorSuggestions } from "./schema";
import { TailorProviderError } from "./provider";

const MAX_ATTEMPTS = 3;

export interface TailorProviderCallResult {
  /** null when the call degraded — nothing to review, the profile carries
   *  over unchanged. */
  suggestions: TailorSuggestions | null;
  degraded: boolean;
  promptVersion: string;
  modelVersion: string;
  providerName: "fixture" | "openai" | "anthropic";
}

/**
 * The provider-call step, factored out of generateTailoredResume so
 * lib/tailoring/ai/proposal.ts's preview/confirm split (issue #429) can
 * reuse the exact same budget/retry/degrade behavior instead of a second,
 * drifting copy of it. Returns the raw (already schema-validated)
 * suggestions rather than merged content — merging into persisted content
 * is `mergeTailoringSuggestions`'s job alone, called separately by each
 * caller once it knows what the candidate actually approved.
 */
export async function runTailorProviderCall(
  workspaceId: string,
  targetJobId: string,
  profile: CandidateProfileContent,
  jobText: string,
  instructions?: string | null,
  providerOverride?: "fixture" | "openai" | "anthropic",
  /** Where the cost event is attributed (issue #586). Defaults to the job
   *  itself; the preview route passes its pre-minted preview id so the
   *  tailor + cover-letter line items share one workflow. */
  cost: Partial<Pick<CostAttribution, "subjectType" | "subjectId" | "workflowId">> = {},
): Promise<TailorProviderCallResult> {
  const providerName = providerOverride ?? getEnv().aiProvider;
  const modelVersion = await resolveTailorModelVersion(providerName);
  const { text: profileText } = buildProfileText(profile);
  const prompt = renderTailorPrompt(profileText, jobText, instructions);

  let suggestions: TailorSuggestions | null = null;
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
    await assertCanRunProviderCall(workspaceId, "tailor");
    const provider = await getTailorProvider(providerName);

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
          profileSkillNames: profile.skills.map((s) => s.name),
          experienceSummaries: profile.experience.map((e) => e.summary),
          instructions: prompt.instructionsUsed,
        });
        await recordUsage({
          workspaceId,
          kind: "tailor",
          provider: providerName,
          model: modelVersion,
          promptVersion: prompt.version,
          inputTokens: output.inputTokens,
          outputTokens: output.outputTokens,
          meta: output,
          latencyMs: Date.now() - started,
          attribution,
        });
        suggestions = output.suggestions;
        break;
      } catch (err) {
        await recordBilledFailure(err, { workspaceId, kind: "tailor", provider: providerName, model: modelVersion, promptVersion: prompt.version, attribution });
        const retryable = err instanceof TailorProviderError ? err.retryable : true;
        logError("tailoring.generate.provider_call_failed", err, { workspaceId, targetJobId, attempt, provider: providerName });
        if (attempt >= MAX_ATTEMPTS || !retryable) throw err;
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
      }
    }
  } catch (error) {
    logError("tailoring.generate.degraded", error, { workspaceId, targetJobId, provider: providerName });
    degraded = true;
    suggestions = null;
  }

  return { suggestions, degraded, promptVersion: prompt.version, modelVersion, providerName };
}

/**
 * The tailoring generation pipeline. Mirrors the old matching product's
 * `lib/matching/ai/evaluate.ts` sequence (deleted with the pivot),
 * adapted:
 *
 *   load confirmed profile version + fetched target job
 *     -> assemble input (buildProfileText(profile).text + fenced job text)
 *     -> render versioned prompt (registry.ts's TAILOR_PROMPT_VERSION)
 *     -> budget/quota check
 *     -> provider call (retry x3, on exhaustion or budget-exhaustion ->
 *        degrade to the profile carried over unchanged, via runOrDegrade)
 *     -> mergeTailoringSuggestions() -- the ONLY function that turns
 *        provider output into persisted content, and the structural
 *        guarantee that no fact can be fabricated (see schema.ts)
 *     -> persist TailoredResume + AiUsageLedger row (recordUsage)
 *
 * Unlike the old evaluate.ts, there is no cache: each call is a candidate
 * deliberately asking for a fresh tailored version, not a repeatable
 * (profile, posting) pair keyed for reuse.
 */
export interface GenerateTailoredResumeOptions {
  /** Override the provider selection (tests only) — defaults to
   *  `getEnv().aiProvider` (RESUMATCH_AI_PROVIDER). */
  provider?: "fixture" | "openai" | "anthropic";
  templateKey?: string;
  /** The candidate's own freeform steering text for this run (issue #431).
   *  Already capped by the API route; renderTailorPrompt caps again
   *  defensively. Persisted on the TailoredResume row for provenance only —
   *  it plays no role in re-deriving content once saved. */
  instructions?: string | null;
}

export interface GeneratedTailoredResume {
  id: string;
  content: TailoredResumeContent;
  templateKey: string;
  degraded: boolean;
}

const DEFAULT_TEMPLATE_KEY = "classic";

export async function generateTailoredResume(
  workspaceId: string,
  profileVersionId: string,
  targetJobId: string,
  opts: GenerateTailoredResumeOptions = {},
): Promise<GeneratedTailoredResume> {
  const db = getJobmatchDb();
  const templateKey = opts.templateKey ?? DEFAULT_TEMPLATE_KEY;
  // Minted before the provider call so the cost event can name the exact
  // TailoredResume it paid for (issue #586) without an UPDATE afterwards.
  const tailoredResumeId = randomUUID();

  const version = await getVersion(workspaceId, profileVersionId);
  if (!version) {
    throw new Error(`generateTailoredResume: profile version ${profileVersionId} not found in workspace ${workspaceId}`);
  }

  const targetJob = await db.targetJob.findFirst({
    where: { id: targetJobId, workspaceId },
    select: { rawText: true, status: true },
  });
  if (!targetJob || targetJob.status !== "FETCHED" || !targetJob.rawText) {
    throw new Error(`generateTailoredResume: target job ${targetJobId} has no fetched text in workspace ${workspaceId}`);
  }

  const profile = version.content;
  const { suggestions, degraded, promptVersion, modelVersion } = await runTailorProviderCall(
    workspaceId,
    targetJobId,
    profile,
    targetJob.rawText,
    opts.instructions,
    opts.provider,
    { subjectType: "tailored_resume", subjectId: tailoredResumeId, workflowId: tailoredResumeId },
  );
  const content = mergeTailoringSuggestions(profile, suggestions);

  const row = await db.tailoredResume.create({
    data: {
      id: tailoredResumeId,
      workspaceId,
      profileVersionId,
      targetJobId,
      content,
      templateKey,
      promptVersion,
      modelVersion,
      degraded,
      instructions: opts.instructions?.trim() || null,
    },
    select: { id: true },
  });

  return { id: row.id, content, templateKey, degraded };
}
