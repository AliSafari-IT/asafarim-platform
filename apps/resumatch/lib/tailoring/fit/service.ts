import { getJobmatchDb } from "../../db/client";
import { getEnv, type ResuMatchAiProvider } from "../../env";
import { loadGenerationEvidence } from "../../evidence/store";
import { evidenceRelevanceForJob } from "../selection/select";
import { getVersion, type VersionDetail } from "../../profile/versions";
import { log, logError } from "../../observability/logger";
import { runProviderCallWithBudget } from "../../ai/runProviderCall";
import { resolveFallbackProvider } from "../../ai/fallbackProvider";
import type { CostAttribution } from "../../costs/ledger";
import { recordBilledFailure, settleProviderCall, QuotaExceededError } from "../ai/quota";
import {
  FIT_CONTRACT_VERSION,
  type FitAnalysis,
  type FitAnswer,
  type FitCorrection,
  type FitMethod,
  type FitPriority,
} from "./contract";
import { buildFitInputs, fitInputFingerprint, type FitInputs } from "./inputs";
import { keywordFitOutput } from "./keyword";
import { applyOverlay, latestAnswers, latestCorrections } from "./overlay";
import { scoreFit, type FitScore, type LowFitReason } from "./rubric";
import { assessJobFit } from "../jobFit";
import { validateFitOutput } from "./validate";
import { buildFitView, type FitView } from "./view";
import { renderFitPrompt, type ExplanationLanguage } from "./ai/prompts";
import { FitProviderError } from "./ai/provider";
import { FIT_MODEL_VERSIONS, getFitProvider, JOB_FIT_PROMPT_VERSION } from "./ai/registry";

/**
 * Job fit assessment service (#971): loads the inputs for one workspace,
 * job and profile version, runs or reuses an analysis, and builds what the
 * page shows. Every query is scoped to the session's workspace.
 */

/** One attempt may take this long before it is abandoned. */
export const FIT_ATTEMPT_TIMEOUT_MS = 25_000;
/** No new attempt starts after this much time on one request. */
export const FIT_TOTAL_BUDGET_MS = 45_000;
const KEYWORD = { provider: "keyword", model: "keyword-1", promptVersion: "keyword_fit@1" } as const;

export interface FitContext {
  workspaceId: string;
  targetJobId: string;
  version: VersionDetail;
  inputs: FitInputs;
  answers: FitAnswer[];
  corrections: FitCorrection[];
  /** Evidence revisions of active "yes" answers: applied as an overlay,
   *  so they are left out of the cache key. */
  answerEvidenceIds: Set<string>;
}

export type FitContextError = "profile_not_found" | "profile_not_confirmed" | "job_not_found";

export async function loadFitContext(
  workspaceId: string,
  targetJobId: string,
  profileVersionId: string,
): Promise<{ ok: true; context: FitContext } | { ok: false; error: FitContextError }> {
  const db = getJobmatchDb();
  const version = await getVersion(workspaceId, profileVersionId);
  if (!version) return { ok: false, error: "profile_not_found" };
  if (!version.isConfirmed) return { ok: false, error: "profile_not_confirmed" };
  const job = await db.targetJob.findFirst({
    where: { id: targetJobId, workspaceId },
    select: { rawText: true, status: true },
  });
  if (!job || job.status !== "FETCHED" || !job.rawText) return { ok: false, error: "job_not_found" };

  const evidence = await loadGenerationEvidence(workspaceId, targetJobId, version.content, evidenceRelevanceForJob(job.rawText));
  const inputs = buildFitInputs({ profile: version.content, rawJobText: job.rawText, evidence });
  const [answerRows, correctionRows] = await Promise.all([
    db.jobFitAnswer.findMany({ where: { workspaceId, targetJobId, revokedAt: null }, orderBy: { createdAt: "asc" } }),
    db.jobFitCorrection.findMany({ where: { workspaceId, targetJobId }, orderBy: { createdAt: "asc" } }),
  ]);
  // A "yes" counts only while its evidence is the latest, confirmed
  // revision in scope for this job. Checked on its own, not through the
  // prompt's evidence selection, whose budget may leave it out.
  const usableEvidence = await usableAnswerEvidence(
    workspaceId,
    targetJobId,
    answerRows.flatMap((a) => (a.answer === "yes" && a.evidenceRevisionId ? [a.evidenceRevisionId] : [])),
  );
  const answers: FitAnswer[] = answerRows
    .filter((a) => a.answer === "no" || (a.evidenceRevisionId !== null && usableEvidence.has(a.evidenceRevisionId)))
    .map((a) => ({
      id: a.id,
      requirementId: a.requirementId,
      requirementQuote: a.requirementQuote,
      answer: a.answer === "yes" ? "yes" : "no",
      evidenceRevisionId: a.evidenceRevisionId,
      evidenceText: a.evidenceRevisionId ? (usableEvidence.get(a.evidenceRevisionId) ?? null) : null,
      createdAt: a.createdAt.toISOString(),
    }));
  const corrections: FitCorrection[] = correctionRows.map((c) => ({
    id: c.id,
    requirementId: c.requirementId,
    action: c.action === "priority" || c.action === "not_requirement" ? c.action : "restore",
    priority: (c.priority as FitPriority | null) ?? null,
    createdAt: c.createdAt.toISOString(),
  }));
  const answerEvidenceIds = new Set(answers.filter((a) => a.answer === "yes" && a.evidenceRevisionId).map((a) => a.evidenceRevisionId!));
  return { ok: true, context: { workspaceId, targetJobId, version, inputs, answers, corrections, answerEvidenceIds } };
}

/** Confirmed evidence revisions an answer may rest on: still the latest
 *  revision of an item of this workspace, for this job or background. */
export async function usableAnswerEvidence(workspaceId: string, targetJobId: string, revisionIds: string[]): Promise<Map<string, string>> {
  if (revisionIds.length === 0) return new Map();
  const rows = await getJobmatchDb().candidateEvidenceRevision.findMany({
    where: { id: { in: revisionIds }, workspaceId, status: "CONFIRMED" },
    select: {
      id: true,
      title: true,
      detail: true,
      evidence: {
        select: { scope: true, targetJobId: true, revisions: { orderBy: { revisionNumber: "desc" }, take: 1, select: { id: true } } },
      },
    },
  });
  const usable = new Map<string, string>();
  for (const r of rows) {
    if (r.evidence.revisions[0]?.id !== r.id) continue;
    if (r.evidence.scope === "APPLICATION" && r.evidence.targetJobId !== targetJobId) continue;
    usable.set(r.id, `${r.title}. ${r.detail}`);
  }
  return usable;
}

function providerName(): ResuMatchAiProvider {
  return getEnv().aiProvider;
}

export function fingerprintFor(context: FitContext, method: FitMethod, provider: string): string {
  const ai = method === "ai";
  return fitInputFingerprint({
    workspaceId: context.workspaceId,
    targetJobId: context.targetJobId,
    profileVersionId: context.version.id,
    jobFingerprint: context.inputs.jobFingerprint,
    evidenceRevisionIds: context.inputs.evidenceRevisionIds.filter((id) => !context.answerEvidenceIds.has(id)),
    method,
    provider: ai ? provider : KEYWORD.provider,
    model: ai ? FIT_MODEL_VERSIONS[provider as ResuMatchAiProvider] : KEYWORD.model,
    promptVersion: ai ? JOB_FIT_PROMPT_VERSION : KEYWORD.promptVersion,
  });
}

/** The free keyword check for these inputs. Never persisted, never AI. */
export function keywordAnalysis(context: FitContext): FitAnalysis {
  return validateFitOutput({
    output: keywordFitOutput(context.inputs.selection, context.inputs.sources),
    jobText: context.inputs.jobText,
    sources: context.inputs.sources,
    method: "keyword",
    completeness: { jobTruncated: false, profileSentencesOmitted: 0 },
  });
}

export function scoreFor(context: FitContext, analysis: FitAnalysis): FitScore {
  return scoreFit(applyOverlay(analysis, context.answers, context.corrections), { profileTooThin: context.inputs.profileTooThin });
}

interface StoredRow {
  id: string;
  inputFingerprint: string;
  analysis: unknown;
  createdAt: Date;
  method: string;
  provider: string;
  model: string;
  promptVersion: string;
  profileVersionId: string;
  status: string;
}

const ROW_SELECT = {
  id: true,
  inputFingerprint: true,
  analysis: true,
  createdAt: true,
  method: true,
  provider: true,
  model: true,
  promptVersion: true,
  profileVersionId: true,
  status: true,
} as const;

function readAnalysis(value: unknown): FitAnalysis | null {
  if (!value || typeof value !== "object") return null;
  const a = value as FitAnalysis;
  if (typeof a.version !== "string" || !a.version.startsWith("fit_assessment@") || !Array.isArray(a.requirements) || !Array.isArray(a.assessments)) return null;
  return a;
}

/** The AI analysis to show: the one for exactly these inputs, else the
 *  latest for this job (stale), else none. */
async function findAiRow(context: FitContext): Promise<{ row: StoredRow; analysis: FitAnalysis; stale: boolean } | null> {
  const db = getJobmatchDb();
  const fingerprint = fingerprintFor(context, "ai", providerName());
  const exact = await db.jobFitAssessment.findUnique({
    where: { workspaceId_inputFingerprint: { workspaceId: context.workspaceId, inputFingerprint: fingerprint } },
    select: ROW_SELECT,
  });
  const row =
    exact ??
    (await db.jobFitAssessment.findFirst({
      where: { workspaceId: context.workspaceId, targetJobId: context.targetJobId, method: "ai" },
      orderBy: { createdAt: "desc" },
      select: ROW_SELECT,
    }));
  if (!row) return null;
  const analysis = readAnalysis(row.analysis);
  if (!analysis) return null;
  return { row, analysis, stale: row.inputFingerprint !== fingerprint };
}

export interface FitState {
  /** The AI assessment, or null when none was run for this job. */
  assessment: FitView | null;
  /** The basic keyword check, always available, always labelled. */
  keyword: FitView;
  /** The gate the tailoring flow applies: the current (not stale) AI
   *  assessment when there is one; else the pre-#971 key-term scope check
   *  (lib/tailoring/jobFit.ts), unchanged, so behaviour without an AI
   *  analysis stays as it was. An AI assessment always wins over it. */
  gate: FitGate;
}

export interface FitGate {
  source: "ai" | "keyword";
  lowFit: boolean;
  /** Why it warns: the assessment's reason, or "keyword_scope" with the
   *  key-term share (`keywordScore`) for the keyword gate. */
  reason: LowFitReason | "keyword_scope" | null;
  keywordScore: number | null;
}

export async function fitState(context: FitContext): Promise<FitState> {
  const keyword = keywordAnalysis(context);
  const keywordView = buildFitView({ analysis: keyword, context, score: scoreFor(context, keyword), meta: null });
  const found = await findAiRow(context);
  const assessment = found
    ? buildFitView({
        analysis: found.analysis,
        context,
        score: scoreFor(context, found.analysis),
        meta: {
          id: found.row.id,
          createdAt: found.row.createdAt.toISOString(),
          stale: found.stale,
          provider: found.row.provider,
          model: found.row.model,
          promptVersion: found.row.promptVersion,
          status: found.row.status,
        },
      })
    : null;
  const current = assessment && !assessment.meta?.stale ? assessment : null;
  const scope = current ? null : assessJobFit(context.version.content, context.inputs.jobText);
  return {
    assessment,
    keyword: keywordView,
    gate: current
      ? { source: "ai", lowFit: current.score.lowFit, reason: current.score.lowFitReason, keywordScore: null }
      : { source: "keyword", lowFit: scope!.level === "low", reason: scope!.level === "low" ? "keyword_scope" : null, keywordScore: scope!.score },
  };
}

export type AnalyzeFailure = "budget" | "provider" | "timeout" | "invalid_output" | "unavailable" | "cancelled";

export type AnalyzeResult =
  | { ok: true; reused: boolean; state: FitState }
  | { ok: false; reason: AnalyzeFailure; state: FitState };

/** In-flight analyses in this process, by workspace and inputs: a second
 *  click (or a second tab) waits for the first instead of paying twice. */
const inflight = new Map<string, Promise<AnalyzeOutcome>>();

type AnalyzeOutcome = { ok: true; reused: boolean } | { ok: false; reason: AnalyzeFailure };

export async function analyzeFit(
  context: FitContext,
  opts: { language: ExplanationLanguage; signal?: AbortSignal; provider?: ResuMatchAiProvider },
): Promise<AnalyzeResult> {
  const provider = opts.provider ?? providerName();
  const fingerprint = fingerprintFor(context, "ai", provider);
  const key = `${context.workspaceId}:${fingerprint}`;
  let run = inflight.get(key);
  if (!run) {
    run = runAnalysis(context, fingerprint, provider, opts).finally(() => inflight.delete(key));
    inflight.set(key, run);
  }
  const outcome = await run;
  const state = await fitState(context);
  return outcome.ok ? { ok: true, reused: outcome.reused, state } : { ok: false, reason: outcome.reason, state };
}

async function runAnalysis(
  context: FitContext,
  fingerprint: string,
  provider: ResuMatchAiProvider,
  opts: { language: ExplanationLanguage; signal?: AbortSignal },
): Promise<AnalyzeOutcome> {
  const db = getJobmatchDb();
  const existing = await db.jobFitAssessment.findUnique({
    where: { workspaceId_inputFingerprint: { workspaceId: context.workspaceId, inputFingerprint: fingerprint } },
    select: { id: true },
  });
  if (existing) return { ok: true, reused: true };

  const { inputs } = context;
  const prompt = renderFitPrompt({ jobText: inputs.jobTextUsed, sourcesText: inputs.sourcesText, language: opts.language });
  const attribution: CostAttribution = { subjectType: "target_job", subjectId: context.targetJobId, targetJobId: context.targetJobId };
  const fallbackName = resolveFallbackProvider(provider);
  const started = Date.now();
  const route = async (name: ResuMatchAiProvider) => ({ provider: await getFitProvider(name), name, modelVersion: FIT_MODEL_VERSIONS[name] });

  const result = await runProviderCallWithBudget({
    workspaceId: context.workspaceId,
    kind: "job_fit",
    prepare: () => route(provider),
    fallback: fallbackName
      ? { prepare: () => route(fallbackName), isEligible: (err: unknown) => err instanceof FitProviderError && err.retryable }
      : null,
    call: async ({ provider: p, name, modelVersion }) => {
      if (opts.signal?.aborted) throw new FitProviderError("cancelled", false, "timeout");
      if (Date.now() - started > FIT_TOTAL_BUDGET_MS) throw new FitProviderError("time budget spent", false, "timeout");
      const signal = AbortSignal.any([AbortSignal.timeout(FIT_ATTEMPT_TIMEOUT_MS), ...(opts.signal ? [opts.signal] : [])]);
      const attemptStarted = Date.now();
      const output = await p.analyze({ inputs, system: prompt.system, user: prompt.user, promptVersion: prompt.version, model: modelVersion, signal });
      const latencyMs = Date.now() - attemptStarted;
      return settleProviderCall(
        {
          workspaceId: context.workspaceId,
          kind: "job_fit",
          provider: name,
          model: modelVersion,
          promptVersion: prompt.version,
          inputTokens: output.inputTokens,
          outputTokens: output.outputTokens,
          meta: output,
          latencyMs,
          attribution,
        },
        () => {
          const analysis = validateFitOutput({
            output: output.output,
            jobText: inputs.jobText,
            sources: inputs.sources,
            method: "ai",
            completeness: { jobTruncated: inputs.jobTruncated, profileSentencesOmitted: inputs.profileSentencesOmitted },
          });
          // A reply with no requirement left after validation is no analysis.
          if (output.output.requirements.length > 0 && analysis.requirements.length === 0) {
            throw new FitProviderError("no requirement quote matched the posting", false, "invalid_output");
          }
          return { analysis, name, modelVersion, latencyMs, inputTokens: output.inputTokens, outputTokens: output.outputTokens };
        },
      );
    },
    onAttemptFailed: async (err, { name, modelVersion }, attempt) => {
      await recordBilledFailure(err, {
        workspaceId: context.workspaceId,
        kind: "job_fit",
        provider: name,
        model: modelVersion,
        promptVersion: prompt.version,
        attribution,
      });
      logError("tailoring.fit.provider_call_failed", err, { workspaceId: context.workspaceId, attempt, provider: name });
    },
    isRetryable: (err) => (err instanceof FitProviderError ? err.retryable : false),
  });

  if (!result.ok) {
    const err = result.error;
    const reason: AnalyzeFailure =
      err instanceof QuotaExceededError
        ? "budget"
        : opts.signal?.aborted
          ? "cancelled"
          : err instanceof FitProviderError
            ? err.code
            : "provider";
    logError("tailoring.fit.degraded", err, { workspaceId: context.workspaceId, reason });
    return { ok: false, reason };
  }

  const { analysis, name, modelVersion } = result.value;
  // Counts only, never text: quotes are the candidate's and the posting's.
  log.info("tailoring.fit.analyzed", {
    requirements: analysis.requirements.length,
    ...analysis.validation,
    jobTruncated: analysis.completeness.jobTruncated,
  });
  const incomplete = analysis.completeness.jobTruncated || analysis.completeness.profileSentencesOmitted > 0 || analysis.completeness.requirementsCapped;
  const storedFingerprint = name === provider ? fingerprint : fingerprintFor(context, "ai", name);
  try {
    await db.jobFitAssessment.create({
      data: {
        workspaceId: context.workspaceId,
        targetJobId: context.targetJobId,
        profileVersionId: context.version.id,
        inputFingerprint: storedFingerprint,
        jobFingerprint: inputs.jobFingerprint,
        evidenceRevisionIds: inputs.evidenceRevisionIds,
        method: "ai",
        provider: name,
        model: modelVersion,
        promptVersion: prompt.version,
        contractVersion: FIT_CONTRACT_VERSION,
        status: incomplete ? "incomplete" : "complete",
        analysis: analysis as never,
        score: scoreFor(context, analysis) as never,
        scoredAt: new Date(),
        inputTokens: result.value.inputTokens,
        outputTokens: result.value.outputTokens,
        latencyMs: result.value.latencyMs,
      },
    });
  } catch (err) {
    // Another process stored the same inputs first: theirs stands.
    if ((err as { code?: string }).code !== "P2002") throw err;
  }
  return { ok: true, reused: false };
}

/** Recomputes and stores the score of the current AI assessment after an
 *  answer or correction, so the persisted row reflects it. */
export async function refreshStoredScore(context: FitContext): Promise<void> {
  const found = await findAiRow(context);
  if (!found || found.stale) return;
  await getJobmatchDb().jobFitAssessment.updateMany({
    where: { id: found.row.id, workspaceId: context.workspaceId },
    data: { score: scoreFor(context, found.analysis) as never, scoredAt: new Date() },
  });
}

/** The requirement ids a candidate may answer or correct: those of the
 *  shown AI assessment, or of the keyword check. */
export async function knownRequirementIds(context: FitContext): Promise<Map<string, string>> {
  const found = await findAiRow(context);
  const ids = new Map(keywordAnalysis(context).requirements.map((r) => [r.id, r.quote] as const));
  if (found) for (const r of found.analysis.requirements) ids.set(r.id, r.quote);
  return ids;
}

/** For tailoring (#971): the gate, the requirements the CV must not claim
 *  (unmet or in conflict), and the assessment id for the run's context. */
export async function fitForTailoring(context: FitContext): Promise<{
  lowFit: boolean;
  source: "ai" | "keyword";
  assessmentId: string | null;
  gaps: string[];
  unmetRequirementIds: string[];
}> {
  const state = await fitState(context);
  const view = state.gate.source === "ai" ? state.assessment! : state.keyword;
  // The candidate's own "no" answers hold whatever analysis is shown, so a
  // stale assessment or a keyword-only view does not lose them; a
  // requirement they marked "not a requirement" restricts nothing.
  const corrections = latestCorrections(context.corrections);
  const removed = (id: string) => corrections.get(id)?.action === "not_requirement";
  const denials = [...latestAnswers(context.answers).values()].filter((a) => a.answer === "no" && !removed(a.requirementId));
  const quoteById = new Map(view.rows.map((r) => [r.id, r.quote] as const));
  const gaps = new Set(view.rows.filter((r) => !r.removed && (r.judgment === "unmet" || r.judgment === "conflict")).map((r) => r.quote));
  for (const a of denials) {
    const quote = quoteById.get(a.requirementId) ?? a.requirementQuote ?? null;
    if (quote) gaps.add(quote);
  }
  return {
    lowFit: state.gate.lowFit,
    source: state.gate.source,
    assessmentId: state.gate.source === "ai" ? (state.assessment?.meta?.id ?? null) : null,
    gaps: [...gaps],
    unmetRequirementIds: denials.map((a) => a.requirementId),
  };
}
