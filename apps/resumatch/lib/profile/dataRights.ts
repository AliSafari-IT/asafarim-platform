import "server-only";
import { getJobmatchDb } from "../db/client";
import { deleteDocumentBytes } from "../documents/storage";
import { logError } from "../observability/logger";
import { recordAuditEvent } from "../workspace";
import { forgetWorkspaceDedupResults } from "../shared/aiDedupCache";
import { FEEDBACK_RETENTION_DAYS, PREVIEW_RETENTION_DAYS } from "../privacy/retention";
import { parseTailoredResumeContent } from "../tailoring/ai/schema";
import { parseStoredTailoringContext, type TailoringContext } from "../tailoring/context";
import { parseProfileContent } from "./contract";

/**
 * Candidate data rights (JM-023).
 *
 * GDPR access and erasure, implemented as code paths rather than as an
 * inbox someone has to remember to check. Two things make them honest:
 *
 * **Export is generated from the same rows the app reads.** It is not a
 * curated summary — if ResuMatch stores it, the export contains it. Anything
 * left out of this function is a lie about what is held.
 *
 * **Erasure removes derived artifacts, not just the original.** Deleting a
 * CV while keeping the profile extracted from it would leave the personal
 * data in place and the audit trail claiming otherwise. So erasure takes
 * the documents, the stored bytes, every profile version, and the profile
 * row, in an order where a partial failure leaves no orphaned bytes.
 *
 * The audit trail survives erasure deliberately: it holds action names and
 * timestamps, never CV content, and it is the only record that the erasure
 * happened at all.
 */

/** Documented SLA for erasure. Synchronous here, so the ceiling is met by
 *  construction; the constant exists so the UI can state it. */
export const ERASURE_SLA_DAYS = 30;

export interface DataExport {
  exportedAt: string;
  format: "resumatch-candidate-export";
  formatVersion: "1.1.0";
  workspace: { id: string; createdAt: string };
  documents: {
    id: string;
    filename: string;
    contentType: string;
    byteSize: number;
    contentHash: string;
    status: string;
    uploadedAt: string;
    retainUntil: string | null;
  }[];
  profile: {
    confirmedVersionId: string | null;
    versions: {
      id: string;
      versionNumber: number;
      origin: string;
      extractorName: string;
      extractorVersion: string;
      createdAt: string;
      sourceContentHash: string | null;
      content: unknown;
      confidence: unknown;
    }[];
  } | null;
  targetJobs: {
    id: string;
    sourceUrl: string;
    title: string | null;
    employer: string | null;
    status: string;
    fetchedAt: string;
    rawText: string | null;
  }[];
  tailoredResumes: {
    id: string;
    targetJobId: string;
    profileVersionId: string;
    templateKey: string;
    degraded: boolean;
    showPhoto: boolean | null;
    /** The chosen skills layout (null = automatic). */
    skillsLayout: string | null;
    /** The written skills paragraph, kept even when another layout is active. */
    skillsParagraph: string | null;
    createdAt: string;
    content: unknown;
    /** The request context the CV was made with; null before 0.6.0. */
    tailoringContext: TailoringContext | null;
  }[];
  /** The optional CV photo's metadata. The image itself is not embedded;
   *  it can be downloaded from the profile page. */
  profilePhoto: {
    contentType: string;
    byteSize: number;
    pixelSize: number;
    contentHash: string;
    shape: string;
    includeByDefault: boolean;
    createdAt: string;
    updatedAt: string;
  } | null;
  /** Application emails sent from ResuMatch, as they were sent. The PDF
   *  attachments are listed by filename and hash, not embedded. */
  sentApplicationEmails: {
    id: string;
    companyName: string;
    jobTitle: string | null;
    contactName: string | null;
    contactEmail: string;
    /** The other "To" recipients (#944), and those the server refused. */
    additionalRecipients: string[];
    rejectedRecipients: string[];
    fromAddress: string;
    replyTo: string | null;
    subject: string;
    body: string;
    status: string;
    deliveryStatus: string;
    attemptedAt: string;
    sentAt: string | null;
    attachments: { kind: string; filename: string; contentHash: string }[];
  }[];
  /** Background evidence (#929), every revision included. */
  evidence: {
    id: string;
    scope: string;
    targetJobId: string | null;
    createdAt: string;
    revisions: {
      id: string;
      revisionNumber: number;
      kind: string;
      title: string;
      detail: string;
      experienceRef: unknown;
      status: string;
      confirmedAt: string | null;
      createdAt: string;
    }[];
  }[];
  /** Contact preferences for application emails (#940); null when none. */
  contactPreferences: { content: unknown; updatedAt: string } | null;
  /** Saved writing preferences (#931), every revision, oldest first. */
  writingPreferences: { revisionNumber: number; content: unknown; createdAt: string }[];
  /** Every preview still held (#932, #933): the request context it was
   *  made with (job text copy, your note, style notes) and the AI
   *  suggestions as generated, saved or not. Deleted after
   *  `retention.previewDays`. */
  tailorPreviews: {
    id: string;
    targetJobId: string;
    createdAt: string;
    consumedAt: string | null;
    context: TailoringContext | null;
    suggestions: unknown;
    coverLetterSuggestion: unknown;
  }[];
  /** Cover letters as saved (#933: previously only reachable in the app). */
  coverLetters: {
    id: string;
    targetJobId: string;
    tailoredResumeId: string | null;
    profileVersionId: string;
    promptVersion: string;
    modelVersion: string;
    degraded: boolean;
    outputLanguage: string | null;
    createdAt: string;
    content: unknown;
  }[];
  /** Application tracker rows, with your own notes (#933). */
  applications: {
    id: string;
    targetJobId: string;
    tailoredResumeId: string | null;
    status: string;
    notes: string | null;
    followUpDate: string | null;
    appliedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }[];
  /** How long personalization records are kept (#933). */
  retention: { previewDays: number; feedbackDays: number };
  /** Review feedback per saved CV (#932): the AI's original suggestions,
   *  what you did with each, and anything you chose to remember. */
  tailoringFeedback: {
    tailoredResumeId: string;
    previewId: string;
    feedbackVersion: string;
    original: unknown;
    decisions: unknown;
    promotions: unknown;
    createdAt: string;
  }[];
  /** Each draft's own contact choice (#940): the mode, values just for that
   *  email, and the paragraph its body holds. */
  emailDraftContacts: { applicationId: string; contactMode: string; contactOverride: unknown; contactParagraph: string | null; updatedAt: string }[];
  auditEvents: { action: string; createdAt: string }[];
  /** Stated in the export itself so the recipient is not left inferring it. */
  notes: string[];
}

export async function exportWorkspaceData(workspaceId: string): Promise<DataExport | null> {
  const db = getJobmatchDb();

  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, createdAt: true },
  });
  if (!workspace) return null;

  const [documents, profile, targetJobs, tailoredResumes, auditEvents, profilePhoto, sentEmails, evidence, contactPreferences, emailDraftContacts, writingPreferences, tailoringFeedback, tailorPreviews, coverLetters, applications] = await Promise.all([
    db.candidateDocument.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: { uploadedAt: "asc" },
    }),
    db.candidateProfile.findUnique({
      where: { workspaceId },
      select: {
        confirmedVersionId: true,
        versions: { orderBy: { versionNumber: "asc" } },
      },
    }),
    db.targetJob.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
    }),
    db.tailoredResume.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
    }),
    db.auditEvent.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
      select: { action: true, createdAt: true },
    }),
    db.profilePhoto.findUnique({ where: { workspaceId } }),
    db.sentApplicationEmail.findMany({
      where: { workspaceId },
      orderBy: { attemptedAt: "asc" },
      include: { attachments: { select: { kind: true, filename: true, contentHash: true } } },
    }),
    db.candidateEvidence.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
      include: { revisions: { orderBy: { revisionNumber: "asc" } } },
    }),
    db.contactPreferences.findUnique({ where: { workspaceId }, select: { content: true, updatedAt: true } }),
    db.applicationEmailDraft.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: "asc" },
      select: { applicationId: true, contactMode: true, contactOverride: true, contactParagraph: true, updatedAt: true },
    }),
    db.writingPreferenceRevision.findMany({
      where: { workspaceId },
      orderBy: { revisionNumber: "asc" },
      select: { revisionNumber: true, content: true, createdAt: true },
    }),
    db.tailoringFeedback.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
      select: { tailoredResumeId: true, previewId: true, feedbackVersion: true, original: true, decisions: true, promotions: true, createdAt: true },
    }),
    db.tailorPreview.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
      select: { id: true, targetJobId: true, createdAt: true, consumedAt: true, context: true, suggestions: true, coverLetterSuggestion: true },
    }),
    db.coverLetter.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } }),
    db.application.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } }),
  ]);

  await recordAuditEvent(workspaceId, "datarights.export", { count: documents.length });

  return {
    exportedAt: new Date().toISOString(),
    format: "resumatch-candidate-export",
    formatVersion: "1.1.0",
    workspace: { id: workspace.id, createdAt: workspace.createdAt.toISOString() },
    documents: documents.map((document) => ({
      id: document.id,
      filename: document.originalFilename,
      contentType: document.contentType,
      byteSize: document.byteSize,
      contentHash: document.contentHash,
      status: document.status,
      uploadedAt: document.uploadedAt.toISOString(),
      retainUntil: document.retainUntil?.toISOString() ?? null,
    })),
    profile: profile
      ? {
          confirmedVersionId: profile.confirmedVersionId,
          versions: profile.versions.map((version) => ({
            id: version.id,
            versionNumber: version.versionNumber,
            origin: version.origin,
            extractorName: version.extractorName,
            extractorVersion: version.extractorVersion,
            createdAt: version.createdAt.toISOString(),
            sourceContentHash: version.sourceContentHash,
            // Re-parsed so an export cannot ship a shape the contract would
            // reject — the export is a statement about what is held.
            content: parseProfileContent(version.content),
            confidence: version.confidence,
          })),
        }
      : null,
    targetJobs: targetJobs.map((job) => ({
      id: job.id,
      sourceUrl: job.sourceUrl,
      title: job.title,
      employer: job.employer,
      status: job.status,
      fetchedAt: job.fetchedAt.toISOString(),
      rawText: job.rawText,
    })),
    tailoredResumes: tailoredResumes.map((resume) => ({
      id: resume.id,
      targetJobId: resume.targetJobId,
      profileVersionId: resume.profileVersionId,
      templateKey: resume.templateKey,
      degraded: resume.degraded,
      showPhoto: resume.showPhoto,
      skillsLayout: resume.skillsLayout,
      skillsParagraph: resume.skillsParagraph,
      createdAt: resume.createdAt.toISOString(),
      // Re-parsed for the same reason profile version content is: the
      // export is a statement about what is held, not a shape a stale
      // contract version might have written.
      content: parseTailoredResumeContent(resume.content),
      // The request context the CV was made with (#928), including any
      // saved style notes it used (#931), which outlive a deleted
      // preference revision. Null for a CV saved before 0.6.0.
      tailoringContext: parseStoredTailoringContext(resume.tailoringContext),
    })),
    profilePhoto: profilePhoto
      ? {
          contentType: profilePhoto.contentType,
          byteSize: profilePhoto.byteSize,
          pixelSize: profilePhoto.pixelSize,
          contentHash: profilePhoto.contentHash,
          shape: profilePhoto.shape,
          includeByDefault: profilePhoto.includeByDefault,
          createdAt: profilePhoto.createdAt.toISOString(),
          updatedAt: profilePhoto.updatedAt.toISOString(),
        }
      : null,
    sentApplicationEmails: sentEmails.map((email) => ({
      id: email.id,
      companyName: email.companyName,
      jobTitle: email.jobTitle,
      contactName: email.contactName,
      contactEmail: email.contactEmail,
      additionalRecipients: email.additionalRecipients,
      rejectedRecipients: email.rejectedRecipients,
      fromAddress: email.fromAddress,
      replyTo: email.replyTo,
      subject: email.subject,
      body: email.body,
      status: email.status,
      deliveryStatus: email.deliveryStatus,
      attemptedAt: email.attemptedAt.toISOString(),
      sentAt: email.sentAt?.toISOString() ?? null,
      attachments: email.attachments,
    })),
    evidence: evidence.map((item) => ({
      id: item.id,
      scope: item.scope,
      targetJobId: item.targetJobId,
      createdAt: item.createdAt.toISOString(),
      revisions: item.revisions.map((revision) => ({
        id: revision.id,
        revisionNumber: revision.revisionNumber,
        kind: revision.kind,
        title: revision.title,
        detail: revision.detail,
        experienceRef: revision.experienceRef,
        status: revision.status,
        confirmedAt: revision.confirmedAt?.toISOString() ?? null,
        createdAt: revision.createdAt.toISOString(),
      })),
    })),
    contactPreferences: contactPreferences
      ? { content: contactPreferences.content, updatedAt: contactPreferences.updatedAt.toISOString() }
      : null,
    emailDraftContacts: emailDraftContacts.map((d) => ({
      applicationId: d.applicationId,
      contactMode: d.contactMode,
      contactOverride: d.contactOverride,
      contactParagraph: d.contactParagraph,
      updatedAt: d.updatedAt.toISOString(),
    })),
    writingPreferences: writingPreferences.map((r) => ({
      revisionNumber: r.revisionNumber,
      content: r.content,
      createdAt: r.createdAt.toISOString(),
    })),
    tailorPreviews: tailorPreviews.map((p) => ({
      id: p.id,
      targetJobId: p.targetJobId,
      createdAt: p.createdAt.toISOString(),
      consumedAt: p.consumedAt?.toISOString() ?? null,
      context: parseStoredTailoringContext(p.context),
      suggestions: p.suggestions,
      coverLetterSuggestion: p.coverLetterSuggestion,
    })),
    coverLetters: coverLetters.map((l) => ({
      id: l.id,
      targetJobId: l.targetJobId,
      tailoredResumeId: l.tailoredResumeId,
      profileVersionId: l.profileVersionId,
      promptVersion: l.promptVersion,
      modelVersion: l.modelVersion,
      degraded: l.degraded,
      outputLanguage: l.outputLanguage,
      createdAt: l.createdAt.toISOString(),
      content: l.content,
    })),
    applications: applications.map((a) => ({
      id: a.id,
      targetJobId: a.targetJobId,
      tailoredResumeId: a.tailoredResumeId,
      status: a.status,
      notes: a.notes,
      followUpDate: a.followUpDate?.toISOString() ?? null,
      appliedAt: a.appliedAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    })),
    retention: { previewDays: PREVIEW_RETENTION_DAYS, feedbackDays: FEEDBACK_RETENTION_DAYS },
    tailoringFeedback: tailoringFeedback.map((f) => ({
      tailoredResumeId: f.tailoredResumeId,
      previewId: f.previewId,
      feedbackVersion: f.feedbackVersion,
      original: f.original,
      decisions: f.decisions,
      promotions: f.promotions,
      createdAt: f.createdAt.toISOString(),
    })),
    auditEvents: auditEvents.map((event) => ({
      action: event.action,
      createdAt: event.createdAt.toISOString(),
    })),
    notes: [
      "Your CV photo, if you added one, is not embedded in this JSON. Open it from the photo card on the profile page.",
      "Original uploaded files are not included in this JSON. Download them individually from the profile page while they are still within their retention window.",
      "Your name, email address, and platform account details are held by the ASafariM platform, not by ResuMatch. ResuMatch stores only an opaque account identifier.",
      "Audit events record what happened and when. They never contain CV content.",
      `Previews (the AI suggestions before you saved, with the request they were made for) are deleted ${PREVIEW_RETENTION_DAYS} days after they were made. Review feedback (what you kept, edited or left out) is deleted ${FEEDBACK_RETENTION_DAYS} days after it was recorded. Your saved CVs and letters stay until you delete them.`,
      "Your feedback, preferences and evidence are used only for your own applications. They are never shared with other candidates, never exported as training data, and never used to train an AI model.",
      "To restore your confirmed profile in ResuMatch, upload this file on the profile page. Only the profile is imported; jobs, CVs, emails and history are not.",
    ],
  };
}

export interface ErasureResult {
  documentsDeleted: number;
  versionsDeleted: number;
  targetJobsDeleted: number;
  tailoredResumesDeleted: number;
  objectsDeleted: number;
  objectsFailed: number;
  photoDeleted: boolean;
  /** #933: personalization records, counted as deleted. */
  previewsDeleted: number;
  feedbackDeleted: number;
  evidenceDeleted: number;
  writingPreferenceRevisionsDeleted: number;
  /** In-memory AI dedup results dropped for this workspace. */
  cacheEntriesDeleted: number;
  /** Rows still in the workspace after erasure, read back per table. Only
   *  documents whose bytes could not be removed may remain. */
  remaining: Record<string, number>;
  /** True when every personal-content table reads back empty. */
  verified: boolean;
}

/**
 * Erase all candidate data in a workspace.
 *
 * Object deletes come first and are counted rather than assumed: an object
 * store can fail one delete out of five, and reporting "erased" when bytes
 * remain is worse than reporting a partial failure. The row deletes still
 * proceed, because leaving the metadata behind would not protect anything —
 * but the failure count is returned and audited so it can be chased.
 */
export async function eraseWorkspaceData(workspaceId: string): Promise<ErasureResult> {
  const db = getJobmatchDb();

  const documents = await db.candidateDocument.findMany({
    where: { workspaceId },
    select: { id: true, storageKey: true },
  });

  const removedIds: string[] = [];
  let objectsDeleted = 0;
  let objectsFailed = 0;
  for (const document of documents) {
    try {
      // Verified, not assumed: the shared deleteObject swallows its own
      // errors, so an unverified call cannot distinguish success from
      // silent failure.
      if (await deleteDocumentBytes(document.storageKey)) {
        objectsDeleted += 1;
        removedIds.push(document.id);
      } else {
        objectsFailed += 1;
        logError(
          "datarights.erase.object_failed",
          new Error("ObjectStillPresent"),
          { jobId: document.id },
        );
      }
    } catch (error) {
      objectsFailed += 1;
      logError("datarights.erase.object_failed", error, { jobId: document.id });
    }
  }

  // The CV photo: same rule as documents — the row goes only with its
  // bytes, so a failed delete is counted and the row kept to retry.
  const photo = await db.profilePhoto.findUnique({ where: { workspaceId }, select: { id: true, storageKey: true } });
  let photoDeleted = false;
  if (photo) {
    try {
      if (await deleteDocumentBytes(photo.storageKey)) {
        objectsDeleted += 1;
        photoDeleted = true;
      } else {
        objectsFailed += 1;
        logError("datarights.erase.photo_failed", new Error("ObjectStillPresent"));
      }
    } catch (error) {
      objectsFailed += 1;
      logError("datarights.erase.photo_failed", error);
    }
  }

  // Rendered CV / letter PDFs (send application): same rule as documents —
  // a row goes only with its verified-deleted bytes.
  const pdfs = await db.documentPdf.findMany({ where: { workspaceId }, select: { id: true, storageKey: true } });
  const removedPdfIds: string[] = [];
  for (const pdf of pdfs) {
    try {
      if (await deleteDocumentBytes(pdf.storageKey)) {
        objectsDeleted += 1;
        removedPdfIds.push(pdf.id);
      } else {
        objectsFailed += 1;
        logError("datarights.erase.pdf_failed", new Error("ObjectStillPresent"), { jobId: pdf.id });
      }
    } catch (error) {
      objectsFailed += 1;
      logError("datarights.erase.pdf_failed", error, { jobId: pdf.id });
    }
  }

  const profile = await db.candidateProfile.findUnique({
    where: { workspaceId },
    select: { id: true, _count: { select: { versions: true } } },
  });

  // In-memory copies first (#933): a CV extracted or a job fetched in the
  // last five minutes must not be served again after erasure.
  const cacheEntriesDeleted = forgetWorkspaceDedupResults(workspaceId);

  const deleted = await db.$transaction(async (tx) => {
    // TailoredResume.profileVersionId is a Restrict FK — it must be gone
    // before a CandidateProfileVersion it references can be deleted, or the
    // transaction would fail with an FK violation. TargetJob has no such
    // dependency but is deleted here anyway, in the same all-or-nothing
    // transaction as the rest of this workspace's derived data.
    // Sent application emails are a record of what the candidate sent, and
    // erasure removes them too (their attachment rows cascade). They go
    // first: an attachment row holds its PDF row in place.
    await tx.sentApplicationEmail.deleteMany({ where: { workspaceId } });
    await tx.applicationEmailDraft.deleteMany({ where: { workspaceId } });
    if (removedPdfIds.length > 0) await tx.documentPdf.deleteMany({ where: { workspaceId, id: { in: removedPdfIds } } });
    // Review feedback (#932) holds copies of suggestions and edits. It
    // cascades with its CV; deleted explicitly so nothing depends on that.
    const feedback = await tx.tailoringFeedback.deleteMany({ where: { workspaceId } });
    const tailoredResumes = await tx.tailoredResume.deleteMany({ where: { workspaceId } });
    // Previews hold the request context (#928): the candidate's note and a
    // copy of the job text, even when nothing was saved. The workspace row
    // stays, so they would not cascade; they go with the rest.
    const previews = await tx.tailorPreview.deleteMany({ where: { workspaceId } });
    // Background evidence (#929) is the candidate's own text; its
    // revisions cascade with each item.
    const evidence = await tx.candidateEvidence.deleteMany({ where: { workspaceId } });
    // Revisions cascade with their item; any left behind (none expected)
    // carry the candidate's text, so they are deleted by workspace too.
    await tx.candidateEvidenceRevision.deleteMany({ where: { workspaceId } });
    // Contact preferences (#940): when the candidate takes calls. The
    // workspace row stays, so they would not cascade.
    await tx.contactPreferences.deleteMany({ where: { workspaceId } });
    // Writing preferences (#931): the candidate's style notes, every
    // revision. Same reason: the workspace row stays.
    const preferences = await tx.writingPreferenceRevision.deleteMany({ where: { workspaceId } });
    const targetJobs = await tx.targetJob.deleteMany({ where: { workspaceId } });

    if (profile) {
      // The confirmed pointer is cleared first: it references a version row,
      // and deleting versions out from under it would violate the FK.
      await tx.candidateProfile.update({
        where: { id: profile.id },
        data: { confirmedVersionId: null },
      });
      await tx.candidateProfileVersion.deleteMany({ where: { profileId: profile.id } });
      await tx.candidateProfile.delete({ where: { id: profile.id } });
    }
    // Scoped to the ids whose bytes we actually removed, never to the whole
    // workspace. Two rows would otherwise be destroyed wrongly: one uploaded
    // after the enumeration above (its object was never deleted, and losing
    // the row orphans it permanently), and one whose object delete failed
    // (the same outcome). Both stay, and the caller is told.
    await tx.candidateDocument.deleteMany({ where: { workspaceId, id: { in: removedIds } } });
    // Only if the row still names the object just removed: a photo saved
    // from another tab meanwhile keeps its row, so its bytes are never
    // left without one.
    if (photo && photoDeleted)
      await tx.profilePhoto.deleteMany({ where: { id: photo.id, storageKey: photo.storageKey } });

    return {
      targetJobs: targetJobs.count,
      tailoredResumes: tailoredResumes.count,
      previews: previews.count,
      feedback: feedback.count,
      evidence: evidence.count,
      preferences: preferences.count,
    };
  });

  const remaining = await remainingWorkspaceRows(workspaceId);
  const verified = Object.entries(remaining).every(([table, count]) => table === "documents" || count === 0);

  // Written after the deletion, and deliberately kept: it holds an action
  // name and a timestamp, never CV content, and it is the only remaining
  // evidence that the erasure was carried out.
  await recordAuditEvent(workspaceId, "datarights.erased", {
    count: documents.length,
    outcome: !verified ? "rows_remaining" : objectsFailed === 0 ? "complete" : "objects_pending",
  });

  return {
    documentsDeleted: removedIds.length,
    versionsDeleted: profile?._count.versions ?? 0,
    targetJobsDeleted: deleted.targetJobs,
    tailoredResumesDeleted: deleted.tailoredResumes,
    objectsDeleted,
    objectsFailed,
    photoDeleted,
    previewsDeleted: deleted.previews,
    feedbackDeleted: deleted.feedback,
    evidenceDeleted: deleted.evidence,
    writingPreferenceRevisionsDeleted: deleted.preferences,
    cacheEntriesDeleted,
    remaining,
    verified,
  };
}

/**
 * Reads back what erasure should have removed (#933), so "erased" is a
 * checked statement rather than an assumption. Counts only.
 */
export async function remainingWorkspaceRows(workspaceId: string): Promise<Record<string, number>> {
  const db = getJobmatchDb();
  const where = { workspaceId };
  const [documents, profiles, targetJobs, tailoredResumes, coverLetters, applications, previews, feedback, evidence, evidenceRevisions, writingPreferences, contactPreferences, sentEmails, emailDrafts] = await Promise.all([
    db.candidateDocument.count({ where }),
    db.candidateProfile.count({ where }),
    db.targetJob.count({ where }),
    db.tailoredResume.count({ where }),
    db.coverLetter.count({ where }),
    db.application.count({ where }),
    db.tailorPreview.count({ where }),
    db.tailoringFeedback.count({ where }),
    db.candidateEvidence.count({ where }),
    db.candidateEvidenceRevision.count({ where }),
    db.writingPreferenceRevision.count({ where }),
    db.contactPreferences.count({ where }),
    db.sentApplicationEmail.count({ where }),
    db.applicationEmailDraft.count({ where }),
  ]);
  return { documents, profiles, targetJobs, tailoredResumes, coverLetters, applications, previews, feedback, evidence, evidenceRevisions, writingPreferences, contactPreferences, sentEmails, emailDrafts };
}
