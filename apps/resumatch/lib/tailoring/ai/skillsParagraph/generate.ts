import { getJobmatchDb } from "../../../db/client";
import { getEnv, type ResuMatchAiProvider } from "../../../env";
import { log, logError } from "../../../observability/logger";
import { runProviderCallWithBudget } from "../../../ai/runProviderCall";
import { resolveFallbackProvider } from "../../../ai/fallbackProvider";
import type { CostAttribution } from "../../../costs/ledger";
import { getVersion } from "../../../profile/versions";
import { parseTailoredResumeContent } from "../schema";
import { recordBilledFailure, settleProviderCall, QuotaExceededError } from "../quota";
import { checkSkillsParagraph } from "./check";
import { skillsParagraphInputs } from "./inputs";
import { renderSkillsParagraphPrompt } from "./prompts";
import { SkillsParagraphProviderError } from "./provider";
import { SKILLS_PARAGRAPH_MODEL_VERSIONS, getSkillsParagraphProvider } from "./registry";

export type SkillsParagraphOutcome =
  | { ok: true; paragraph: string; removedSentences: number }
  | { ok: false; reason: "not_found" | "no_skills" | "budget" | "failed" | "nothing_left" };

/**
 * Write, check and store the skills paragraph for one tailored CV, on the
 * candidate's request. The CV's content (its skill list) is never changed:
 * the paragraph is stored beside it (`TailoredResume.skillsParagraph`) and
 * the CV switches to the paragraph layout only once one passed the check.
 * Any failure — budget, provider, a reply with nothing left after the
 * check — leaves the CV exactly as it was.
 */
export async function writeSkillsParagraph(
  workspaceId: string,
  tailoredResumeId: string,
  opts: { provider?: ResuMatchAiProvider } = {},
): Promise<SkillsParagraphOutcome> {
  const db = getJobmatchDb();
  const row = await db.tailoredResume.findFirst({
    where: { id: tailoredResumeId, workspaceId },
    select: { content: true, outputLanguage: true, targetJobId: true, profileVersionId: true },
  });
  if (!row) return { ok: false, reason: "not_found" };

  const content = parseTailoredResumeContent(row.content);
  if (content.skills.length === 0) return { ok: false, reason: "no_skills" };

  const version = await getVersion(workspaceId, row.profileVersionId);
  const { language, groups, categoryLabels, profileText } = skillsParagraphInputs({
    skills: content.skills,
    outputLanguage: row.outputLanguage,
    profileContent: version?.content,
  });

  const primary = opts.provider ?? getEnv().aiProvider;
  const fallbackName = resolveFallbackProvider(primary);
  const prompt = renderSkillsParagraphPrompt({ groups, language });
  const attribution: CostAttribution = {
    subjectType: "tailored_resume",
    subjectId: tailoredResumeId,
    parentSubjectType: "target_job",
    parentSubjectId: row.targetJobId,
    targetJobId: row.targetJobId,
  };

  const result = await runProviderCallWithBudget({
    workspaceId,
    kind: "skills_paragraph",
    prepare: async () => ({
      provider: await getSkillsParagraphProvider(primary),
      name: primary,
      modelVersion: SKILLS_PARAGRAPH_MODEL_VERSIONS[primary],
    }),
    fallback: fallbackName
      ? {
          prepare: async () => ({
            provider: await getSkillsParagraphProvider(fallbackName),
            name: fallbackName,
            modelVersion: SKILLS_PARAGRAPH_MODEL_VERSIONS[fallbackName],
          }),
          isEligible: (err: unknown) => err instanceof SkillsParagraphProviderError && err.retryable,
        }
      : null,
    call: async ({ provider, name, modelVersion }) => {
      const started = Date.now();
      const output = await provider.write({
        groups,
        language,
        system: prompt.system,
        user: prompt.user,
        promptVersion: prompt.version,
        model: modelVersion,
      });
      // An empty reply is a failed (but billed) call; never retried, the
      // same input would give the same shape.
      return settleProviderCall(
        {
          workspaceId,
          kind: "skills_paragraph",
          provider: name,
          model: modelVersion,
          promptVersion: prompt.version,
          inputTokens: output.inputTokens,
          outputTokens: output.outputTokens,
          meta: output,
          latencyMs: Date.now() - started,
          attribution,
        },
        () => {
          const text = output.text.trim();
          if (!text) throw new SkillsParagraphProviderError("empty skills paragraph", false);
          return text;
        },
      );
    },
    onAttemptFailed: async (err, { name, modelVersion }, attempt) => {
      await recordBilledFailure(err, {
        workspaceId,
        kind: "skills_paragraph",
        provider: name,
        model: modelVersion,
        promptVersion: prompt.version,
        attribution,
      });
      logError("tailoring.skillsParagraph.provider_call_failed", err, { workspaceId, attempt, provider: name });
    },
    isRetryable: (err) => (err instanceof SkillsParagraphProviderError ? err.retryable : false),
  });

  if (!result.ok) {
    const budget = result.error instanceof QuotaExceededError;
    logError("tailoring.skillsParagraph.degraded", result.error, { workspaceId, budget });
    return { ok: false, reason: budget ? "budget" : "failed" };
  }

  const checked = checkSkillsParagraph(result.value, { skills: content.skills, categoryLabels, profileText, language });
  if (checked.removedSentences > 0) {
    // Counts and reasons only — the text is profile-derived content.
    log.warn("tailoring.skillsParagraph.sentences_removed", {
      removedSentences: checked.removedSentences,
      reasons: checked.reasons,
      kept: checked.paragraph !== null,
    });
  }
  if (!checked.paragraph) return { ok: false, reason: "nothing_left" };

  await db.tailoredResume.updateMany({
    where: { id: tailoredResumeId, workspaceId },
    // A fresh AI paragraph replaces any hand edit (the picker asks first).
    data: { skillsParagraph: checked.paragraph, skillsLayout: "paragraph", skillsParagraphEditedAt: null },
  });
  return { ok: true, paragraph: checked.paragraph, removedSentences: checked.removedSentences };
}
