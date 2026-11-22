import "server-only";
import { getJobmatchDb } from "../db/client";
import { deleteDocumentBytes } from "../documents/storage";
import { logError } from "../observability/logger";
import { recordAuditEvent } from "../workspace";
import { parseTailoredResumeContent } from "../tailoring/ai/schema";
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
  formatVersion: "1.0.0";
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

  const [documents, profile, targetJobs, tailoredResumes, auditEvents, profilePhoto, sentEmails] = await Promise.all([
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
  ]);

  await recordAuditEvent(workspaceId, "datarights.export", { count: documents.length });

  return {
    exportedAt: new Date().toISOString(),
    format: "resumatch-candidate-export",
    formatVersion: "1.0.0",
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
    auditEvents: auditEvents.map((event) => ({
      action: event.action,
      createdAt: event.createdAt.toISOString(),
    })),
    notes: [
      "Your CV photo, if you added one, is not embedded in this JSON. Open it from the photo card on the profile page.",
      "Original uploaded files are not included in this JSON. Download them individually from the profile page while they are still within their retention window.",
      "Your name, email address, and platform account details are held by the ASafariM platform, not by ResuMatch. ResuMatch stores only an opaque account identifier.",
      "Audit events record what happened and when. They never contain CV content.",
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

  const [targetJobsDeleted, tailoredResumesDeleted] = await db.$transaction(async (tx) => {
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
    const tailoredResumes = await tx.tailoredResume.deleteMany({ where: { workspaceId } });
    // Previews hold the request context (#928): the candidate's note and a
    // copy of the job text, even when nothing was saved. The workspace row
    // stays, so they would not cascade; they go with the rest.
    await tx.tailorPreview.deleteMany({ where: { workspaceId } });
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

    return [targetJobs.count, tailoredResumes.count];
  });

  // Written after the deletion, and deliberately kept: it holds an action
  // name and a timestamp, never CV content, and it is the only remaining
  // evidence that the erasure was carried out.
  await recordAuditEvent(workspaceId, "datarights.erased", {
    count: documents.length,
    outcome: objectsFailed === 0 ? "complete" : "objects_pending",
  });

  return {
    documentsDeleted: removedIds.length,
    versionsDeleted: profile?._count.versions ?? 0,
    targetJobsDeleted,
    tailoredResumesDeleted,
    objectsDeleted,
    objectsFailed,
    photoDeleted,
  };
}
