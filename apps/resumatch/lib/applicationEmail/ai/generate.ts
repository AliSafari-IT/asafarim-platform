import "server-only";
import { sourceCasing } from "../../tailoring/ai/sourceCasing";
import { getJobmatchDb } from "../../db/client";
import { getEnv, type ResuMatchAiProvider } from "../../env";
import { log, logError } from "../../observability/logger";
import { runProviderCallWithBudget } from "../../ai/runProviderCall";
import { resolveFallbackProvider } from "../../ai/fallbackProvider";
import type { CostAttribution } from "../../costs/ledger";
import { getVersion } from "../../profile/versions";
import { buildProfileText } from "../../tailoring/buildProfileText";
import { isOutputLanguage, type OutputLanguage } from "../../tailoring/language";
import { parseTailoredResumeContent } from "../../tailoring/ai/schema";
import { parseCoverLetterContent } from "../../tailoring/ai/coverLetter/schema";
import { groundCoverLetterSuggestion, ungrounded } from "../../tailoring/ai/coverLetter/grounding";
import { QuotaExceededError, recordBilledFailure, settleProviderCall } from "../../tailoring/ai/quota";
import { cleanHeaderText, SUBJECT_MAX_LENGTH } from "../normalize";
import { ApplicationEmailProviderError } from "./provider";
import { renderApplicationEmailPrompt } from "./prompts";
import { APPLICATION_EMAIL_MODEL_VERSIONS, getApplicationEmailProvider } from "./registry";
import type { ApplicationEmailSuggestion } from "./schema";

/**
 * Write a subject and message for an application email, from the real job,
 * profile and attached cover letter (send-application.md). Nothing is
 * stored: the composer decides whether the text replaces what is in the
 * fields, so a regenerate can never overwrite a hand edit unasked.
 *
 * The reply goes through the cover letter's checks before the candidate
 * sees it (lib/tailoring/ai/coverLetter/grounding.ts): an unbacked claim
 * (mentoring, leadership, a language, a credential…) loses its sentence, a
 * paragraph naming a person, company or number found in neither the
 * profile nor the job is dropped, and an invented greeting or sign-off is
 * replaced by the language's neutral one. A subject that fails the same
 * check is replaced by one built in code.
 */

export type GenerateEmailOutcome =
  | {
      ok: true;
      subject: string;
      body: string;
      language: OutputLanguage;
      /** Sentences or paragraphs taken out by the checks; shown as a note. */
      removed: number;
    }
  | { ok: false; reason: "not_found" | "no_documents" | "budget" | "failed" | "nothing_left" };

const SUBJECT_WORD: Record<OutputLanguage, string> = {
  en: "Application",
  nl: "Sollicitatie",
  fr: "Candidature",
  de: "Bewerbung",
};

export function fallbackSubject(language: OutputLanguage, jobTitle: string | null, employer: string | null, fullName: string | null): string {
  const role = [jobTitle, employer].filter(Boolean).join(" – ");
  const subject = [`${SUBJECT_WORD[language]}${role ? `: ${role}` : ""}`, fullName].filter(Boolean).join(" – ");
  return subject.slice(0, SUBJECT_MAX_LENGTH);
}

/** Greeting, paragraphs, sign-off and the candidate's name (from code). */
export function assembleBody(suggestion: Pick<ApplicationEmailSuggestion, "greeting" | "paragraphs" | "signOff">, fullName: string | null): string {
  const closing = fullName ? `${suggestion.signOff}\n${fullName}` : suggestion.signOff;
  return [suggestion.greeting, ...suggestion.paragraphs, closing].join("\n\n");
}

export async function generateApplicationEmail(
  workspaceId: string,
  applicationId: string,
  opts: { contactName?: string | null; provider?: ResuMatchAiProvider } = {},
): Promise<GenerateEmailOutcome> {
  const db = getJobmatchDb();
  const application = await db.application.findFirst({
    where: { id: applicationId, workspaceId },
    select: {
      targetJobId: true,
      targetJob: { select: { title: true, employer: true, rawText: true } },
      tailoredResume: {
        select: {
          id: true,
          content: true,
          outputLanguage: true,
          profileVersionId: true,
          coverLetter: { select: { content: true, outputLanguage: true } },
        },
      },
    },
  });
  if (!application) return { ok: false, reason: "not_found" };
  const resume = application.tailoredResume;
  if (!resume?.coverLetter) return { ok: false, reason: "no_documents" };

  const cv = parseTailoredResumeContent(resume.content);
  const letter = parseCoverLetterContent(resume.coverLetter.content);
  const language: OutputLanguage = isOutputLanguage(resume.coverLetter.outputLanguage)
    ? resume.coverLetter.outputLanguage
    : isOutputLanguage(resume.outputLanguage)
      ? resume.outputLanguage
      : "en";
  const version = await getVersion(workspaceId, resume.profileVersionId);
  const profileText = version ? buildProfileText(version.content).text : "";
  const letterText = letter.paragraphs.join("\n\n");
  const jobTitle = application.targetJob.title;
  const employer = application.targetJob.employer;
  const contactName = opts.contactName ? cleanHeaderText(opts.contactName).slice(0, 120) || null : null;
  const fullName = letter.fullName ?? cv.fullName ?? null;

  const prompt = renderApplicationEmailPrompt({
    language,
    jobTitle,
    employer,
    jobText: application.targetJob.rawText ?? "",
    profileText,
    letterText,
    contactName,
  });
  const primary = opts.provider ?? getEnv().aiProvider;
  const fallbackName = resolveFallbackProvider(primary);
  const attribution: CostAttribution = {
    subjectType: "tailored_resume",
    subjectId: resume.id,
    parentSubjectType: "target_job",
    parentSubjectId: application.targetJobId,
    targetJobId: application.targetJobId,
  };
  const call = {
    language,
    jobTitle,
    employer,
    contactName,
    profileText,
    system: prompt.system,
    user: prompt.user,
    promptVersion: prompt.version,
  };

  const result = await runProviderCallWithBudget({
    workspaceId,
    kind: "application_email",
    prepare: async () => ({
      provider: await getApplicationEmailProvider(primary),
      name: primary,
      modelVersion: APPLICATION_EMAIL_MODEL_VERSIONS[primary],
    }),
    fallback: fallbackName
      ? {
          prepare: async () => ({
            provider: await getApplicationEmailProvider(fallbackName),
            name: fallbackName,
            modelVersion: APPLICATION_EMAIL_MODEL_VERSIONS[fallbackName],
          }),
          isEligible: (err: unknown) => err instanceof ApplicationEmailProviderError && err.retryable,
        }
      : null,
    call: async ({ provider, name, modelVersion }) => {
      const started = Date.now();
      const output = await provider.generate({ ...call, model: modelVersion });
      return settleProviderCall(
        {
          workspaceId,
          kind: "application_email",
          provider: name,
          model: modelVersion,
          promptVersion: prompt.version,
          inputTokens: output.inputTokens,
          outputTokens: output.outputTokens,
          meta: output,
          latencyMs: Date.now() - started,
          attribution,
        },
        () => output.suggestion,
      );
    },
    onAttemptFailed: async (err, { name, modelVersion }, attempt) => {
      await recordBilledFailure(err, {
        workspaceId,
        kind: "application_email",
        provider: name,
        model: modelVersion,
        promptVersion: prompt.version,
        attribution,
      });
      logError("applicationEmail.ai.provider_call_failed", err, { workspaceId, attempt, provider: name });
    },
    isRetryable: (err) => (err instanceof ApplicationEmailProviderError ? err.retryable : false),
  });

  if (!result.ok) {
    const budget = result.error instanceof QuotaExceededError;
    logError("applicationEmail.ai.degraded", result.error, { workspaceId, budget });
    return { ok: false, reason: budget ? "budget" : "failed" };
  }

  // Evidence: the profile and the attached letter (already checked when it
  // was written); the job text and the recipient's name for names in it.
  const evidenceText = `${profileText}\n${letterText}`;
  const jobText = [jobTitle, employer, application.targetJob.rawText, contactName].filter(Boolean).join("\n");
  const grounded = groundCoverLetterSuggestion(result.value, evidenceText, jobText, language);
  if (!grounded.suggestion) return { ok: false, reason: "nothing_left" };

  const sourceLower = `${evidenceText}\n${jobText}`.toLowerCase();
  const rawSubject = cleanHeaderText(result.value.subject);
  const subjectReplaced = !rawSubject || ungrounded(rawSubject, sourceLower, language === "de" ? "headline" : "prose");
  const subject = subjectReplaced
    ? fallbackSubject(language, jobTitle, employer, fullName)
    : sourceCasing(`${evidenceText}\n${jobText}`).apply(rawSubject).slice(0, SUBJECT_MAX_LENGTH);

  const removed = grounded.removedClaimSentences + grounded.tokenDroppedParagraphs;
  if (removed > 0 || subjectReplaced) {
    log.warn("applicationEmail.ai.checked", { removed, subjectReplaced, greetingReplaced: grounded.greetingReplaced });
  }
  return { ok: true, subject, body: assembleBody(grounded.suggestion, fullName), language, removed };
}
