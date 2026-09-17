import { getJobmatchDb } from "../../db/client";
import { getEnv } from "../../env";
import { logError } from "../../observability/logger";
import { getVersion } from "../../profile/versions";
import { buildProfileText } from "../buildProfileText";
import { runOrDegrade } from "./degraded";
import { renderTailorPrompt } from "./prompts";
import { assertCanRunProviderCall, recordUsage } from "./quota";
import { getTailorProvider, TAILOR_MODEL_VERSIONS } from "./registry";
import { mergeTailoringSuggestions, type TailoredResumeContent } from "./schema";
import { TailorProviderError } from "./provider";

/**
 * The tailoring generation pipeline. Mirrors the old matching product's
 * `lib/matching/ai/evaluate.ts` sequence (deleted with the pivot),
 * adapted:
 *
 *   load confirmed profile version + fetched target job
 *     -> assemble input (buildProfileText(profile).text + fenced job text)
 *     -> render versioned prompt (tailor_resume@1)
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
   *  `getEnv().aiProvider` (JOBMATCH_AI_PROVIDER). */
  provider?: "fixture" | "openai" | "anthropic";
  templateKey?: string;
}

export interface GeneratedTailoredResume {
  id: string;
  content: TailoredResumeContent;
  templateKey: string;
  degraded: boolean;
}

const MAX_ATTEMPTS = 3;
const DEFAULT_TEMPLATE_KEY = "classic";

export async function generateTailoredResume(
  workspaceId: string,
  profileVersionId: string,
  targetJobId: string,
  opts: GenerateTailoredResumeOptions = {},
): Promise<GeneratedTailoredResume> {
  const db = getJobmatchDb();
  const { aiProvider } = getEnv();
  const providerName = opts.provider ?? aiProvider;
  const modelVersion = TAILOR_MODEL_VERSIONS[providerName];
  const templateKey = opts.templateKey ?? DEFAULT_TEMPLATE_KEY;

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
  const { text: profileText } = buildProfileText(profile);
  const jobText = targetJob.rawText;
  const prompt = renderTailorPrompt(profileText, jobText);

  const { content, degraded } = await runOrDegrade(profile, async () => {
    await assertCanRunProviderCall(workspaceId, "tailor");

    const provider = await getTailorProvider(providerName);

    for (let attempt = 1; ; attempt++) {
      try {
        const output = await provider.generate({
          profileText,
          jobText: prompt.jobTextUsed,
          system: prompt.system,
          user: prompt.user,
          promptVersion: prompt.version,
          model: modelVersion,
          profileSkillNames: profile.skills.map((s) => s.name),
          experienceSummaries: profile.experience.map((e) => e.summary),
        });
        await recordUsage({
          workspaceId,
          kind: "tailor",
          provider: providerName,
          model: modelVersion,
          promptVersion: prompt.version,
          inputTokens: output.inputTokens,
          outputTokens: output.outputTokens,
          costUsd: output.costUsd,
        });
        return mergeTailoringSuggestions(profile, output.suggestions);
      } catch (err) {
        const retryable = err instanceof TailorProviderError ? err.retryable : true;
        logError("tailoring.generate.provider_call_failed", err, { workspaceId, targetJobId, attempt, provider: providerName });
        if (attempt >= MAX_ATTEMPTS || !retryable) throw err;
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
      }
    }
  });

  const row = await db.tailoredResume.create({
    data: {
      workspaceId,
      profileVersionId,
      targetJobId,
      content,
      templateKey,
      promptVersion: prompt.version,
      modelVersion,
      degraded,
    },
    select: { id: true },
  });

  return { id: row.id, content, templateKey, degraded };
}
