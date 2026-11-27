import { getJobmatchDb } from "../../db/client";
import type { TailoringContext } from "../context";
import type { FitAnalysis, FitAnswer, FitCorrection, FitPriority } from "./contract";
import { applyOverlay } from "./overlay";
import { FIT_RUBRIC_VERSION, scoreFit, type FitScore } from "./rubric";
import { fingerprintFor, loadFitContext, readAnalysis, type FitContext } from "./service";
import { buildFitView, type FitView } from "./view";

/**
 * The job fit shown on a saved CV's preview (#973). Read-only: never calls
 * a provider, never writes.
 *
 * A saved CV names the assessment its run used in its request context
 * (`tailoringContext.fit`, written by generate-preview since 0.7.0). This
 * resolves exactly that assessment, and only when it belongs to the CV's
 * own workspace, job and profile version: a score made for another
 * profile version is never attached because the job id matches.
 *
 * The analysis is immutable; the candidate's answers and corrections are
 * an overlay (overlay.ts). So the score shows what it was when the CV was
 * saved: the overlay is rebuilt from the answers and corrections that
 * existed at the CV's `createdAt` (answers revoked later still count,
 * answers given later do not). A later answer or reanalysis never changes
 * the meaning of an older CV; it shows as a separate, labelled "other
 * assessment" instead.
 *
 * Every other case is said as it is: a CV made before 0.7.0, a CV whose
 * run used only the basic keyword check, a recorded assessment that has
 * since been deleted, or a job with no text left to compare. None gets a
 * substitute number.
 */

export type SavedCvFitReason =
  /** Saved before 0.7.0: no record of a fit assessment. */
  | "legacy"
  /** The run had no current AI assessment; the basic keyword check gated it. */
  | "keyword"
  /** The recorded assessment no longer exists (deleted with evidence it read). */
  | "missing"
  /** The job has no text to compare, or the profile version cannot be read. */
  | "unavailable";

/** Another AI assessment of this CV's job and profile version: newer than
 *  the recorded one, or the only one there is. Never the CV's own. */
export interface OtherFitAssessment {
  id: string;
  createdAt: string;
  /** The job, evidence or analysis version changed since it was made. */
  stale: boolean;
  score: Pick<FitScore, "percent" | "band" | "suppressed" | "completeness" | "suitability">;
}

export type SavedCvFit =
  | {
      kind: "recorded";
      view: FitView;
      /** The CV's own time: answers and corrections are taken as of then. */
      asOf: string;
      /** The job, evidence or analysis version changed since the analysis. */
      inputsChanged: boolean;
      recordedRubricVersion: string;
      /** The score was recomputed with a newer rubric than the CV's run used. */
      rubricChanged: boolean;
      other: OtherFitAssessment | null;
    }
  | { kind: "none"; reason: SavedCvFitReason; other: OtherFitAssessment | null };

export interface SavedCvInput {
  workspaceId: string;
  profileVersionId: string;
  targetJobId: string;
  createdAt: Date;
  /** The CV's parsed request context, or null (legacy row). */
  context: TailoringContext | null;
}

const ROW_SELECT = {
  id: true,
  inputFingerprint: true,
  evidenceRevisionIds: true,
  analysis: true,
  createdAt: true,
  provider: true,
  model: true,
  promptVersion: true,
  status: true,
} as const;

export async function savedCvFit(cv: SavedCvInput): Promise<SavedCvFit> {
  // A snapshot that does not describe this CV's own inputs is no record.
  const snapshot =
    cv.context &&
    cv.context.workspaceId === cv.workspaceId &&
    cv.context.profileVersionId === cv.profileVersionId &&
    cv.context.targetJobId === cv.targetJobId
      ? (cv.context.fit ?? null)
      : null;

  // The CV's own profile version, even when a newer one is confirmed now.
  const loaded = await loadFitContext(cv.workspaceId, cv.targetJobId, cv.profileVersionId, { requireCurrentConfirmed: false });
  if (!loaded.ok) return { kind: "none", reason: "unavailable", other: null };
  const context = loaded.context;
  const db = getJobmatchDb();

  const recordedId = snapshot?.source === "ai" ? snapshot.assessmentId : null;
  const recorded = recordedId
    ? await db.jobFitAssessment.findFirst({
        where: { id: recordedId, workspaceId: cv.workspaceId, targetJobId: cv.targetJobId, profileVersionId: cv.profileVersionId, method: "ai" },
        select: ROW_SELECT,
      })
    : null;
  const recordedAnalysis = recorded ? readAnalysis(recorded.analysis) : null;

  const other = await otherAssessment(context, recorded && recordedAnalysis ? recorded : null);

  if (!snapshot) return { kind: "none", reason: "legacy", other };
  if (snapshot.source !== "ai") return { kind: "none", reason: "keyword", other };
  if (!recorded || !recordedAnalysis) return { kind: "none", reason: "missing", other };

  const asOf = cv.createdAt;
  const historical = { ...context, ...(await overlayAsOf(cv.workspaceId, cv.targetJobId, asOf)) };
  // "Too thin to score" as the analysis saw it: the profile version is
  // immutable, the evidence is the set the analysis read, plus any "yes"
  // that applied by the CV's save. Evidence added later changes nothing.
  const profile = context.version.content;
  const profileTooThin =
    profile.experience.length === 0 &&
    profile.skills.length < 3 &&
    recorded.evidenceRevisionIds.length === 0 &&
    !historical.answers.some((a) => a.answer === "yes");
  const score = scoreFit(applyOverlay(recordedAnalysis, historical.answers, historical.corrections), { profileTooThin });
  const inputsChanged = recorded.inputFingerprint !== fingerprintFor(context, "ai", recorded.provider);
  const view = buildFitView({
    analysis: recordedAnalysis,
    context: historical,
    score,
    meta: {
      id: recorded.id,
      createdAt: recorded.createdAt.toISOString(),
      stale: inputsChanged,
      provider: recorded.provider,
      model: recorded.model,
      promptVersion: recorded.promptVersion,
      status: recorded.status,
    },
  });
  return {
    kind: "recorded",
    view,
    asOf: asOf.toISOString(),
    inputsChanged,
    recordedRubricVersion: snapshot.rubricVersion,
    rubricChanged: snapshot.rubricVersion !== FIT_RUBRIC_VERSION,
    other,
  };
}

/** The latest AI assessment of exactly this job and profile version that
 *  is not the recorded one (and, when there is a recorded one, newer than
 *  it), scored with the candidate's current answers. */
async function otherAssessment(
  context: FitContext,
  recorded: { id: string; createdAt: Date } | null,
): Promise<OtherFitAssessment | null> {
  const row = await getJobmatchDb().jobFitAssessment.findFirst({
    where: {
      workspaceId: context.workspaceId,
      targetJobId: context.targetJobId,
      profileVersionId: context.version.id,
      method: "ai",
      ...(recorded ? { id: { not: recorded.id }, createdAt: { gt: recorded.createdAt } } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: ROW_SELECT,
  });
  const analysis: FitAnalysis | null = row ? readAnalysis(row.analysis) : null;
  if (!row || !analysis) return null;
  const score = scoreFit(applyOverlay(analysis, context.answers, context.corrections), { profileTooThin: context.inputs.profileTooThin });
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    stale: row.inputFingerprint !== fingerprintFor(context, "ai", row.provider),
    score: { percent: score.percent, band: score.band, suppressed: score.suppressed, completeness: score.completeness, suitability: score.suitability },
  };
}

/** The answers and corrections that applied at `asOf`. A "yes" counts
 *  with the confirmed evidence revision it rested on (revisions are
 *  immutable); one whose revision is gone no longer can. */
export async function overlayAsOf(
  workspaceId: string,
  targetJobId: string,
  asOf: Date,
): Promise<{ answers: FitAnswer[]; corrections: FitCorrection[] }> {
  const db = getJobmatchDb();
  const [answerRows, correctionRows] = await Promise.all([
    db.jobFitAnswer.findMany({
      where: { workspaceId, targetJobId, createdAt: { lte: asOf }, OR: [{ revokedAt: null }, { revokedAt: { gt: asOf } }] },
      orderBy: { createdAt: "asc" },
    }),
    db.jobFitCorrection.findMany({ where: { workspaceId, targetJobId, createdAt: { lte: asOf } }, orderBy: { createdAt: "asc" } }),
  ]);
  const revisionIds = answerRows.flatMap((a) => (a.answer === "yes" && a.evidenceRevisionId ? [a.evidenceRevisionId] : []));
  // A "yes" counted only while its revision was, at `asOf`, confirmed and
  // the latest revision of its item (a newer draft supersedes it, as on
  // Tailor), and in scope for this job. Revisions are immutable, so this
  // holds for good; a deleted item's revisions are gone.
  const revisions = revisionIds.length
    ? (
        await db.candidateEvidenceRevision.findMany({
          where: { id: { in: revisionIds }, workspaceId, status: "CONFIRMED", createdAt: { lte: asOf }, confirmedAt: { lte: asOf } },
          select: {
            id: true,
            title: true,
            detail: true,
            evidence: {
              select: {
                scope: true,
                targetJobId: true,
                revisions: { where: { createdAt: { lte: asOf } }, orderBy: { revisionNumber: "desc" }, take: 1, select: { id: true } },
              },
            },
          },
        })
      ).filter((r) => r.evidence.revisions[0]?.id === r.id && !(r.evidence.scope === "APPLICATION" && r.evidence.targetJobId !== targetJobId))
    : [];
  const text = new Map(revisions.map((r) => [r.id, `${r.title}. ${r.detail}`] as const));
  const answers: FitAnswer[] = answerRows
    .filter((a) => a.answer === "no" || (a.evidenceRevisionId !== null && text.has(a.evidenceRevisionId)))
    .map((a) => ({
      id: a.id,
      requirementId: a.requirementId,
      requirementQuote: a.requirementQuote,
      answer: a.answer === "yes" ? "yes" : "no",
      evidenceRevisionId: a.evidenceRevisionId,
      evidenceText: a.evidenceRevisionId ? (text.get(a.evidenceRevisionId) ?? null) : null,
      createdAt: a.createdAt.toISOString(),
    }));
  const corrections: FitCorrection[] = correctionRows.map((c) => ({
    id: c.id,
    requirementId: c.requirementId,
    action: c.action === "priority" || c.action === "not_requirement" ? c.action : "restore",
    priority: (c.priority as FitPriority | null) ?? null,
    createdAt: c.createdAt.toISOString(),
  }));
  return { answers, corrections };
}
