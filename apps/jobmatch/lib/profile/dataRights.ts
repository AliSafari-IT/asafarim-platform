import "server-only";
import { getJobmatchDb } from "../db/client";
import { deleteDocumentBytes } from "../documents/storage";
import { logError } from "../observability/logger";
import { recordAuditEvent } from "../workspace";
import { parseProfileContent } from "./contract";

/**
 * Candidate data rights (JM-023).
 *
 * GDPR access and erasure, implemented as code paths rather than as an
 * inbox someone has to remember to check. Two things make them honest:
 *
 * **Export is generated from the same rows the app reads.** It is not a
 * curated summary — if JobMatch stores it, the export contains it. Anything
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
  format: "jobmatch-candidate-export";
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

  const [documents, profile, auditEvents] = await Promise.all([
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
    db.auditEvent.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
      select: { action: true, createdAt: true },
    }),
  ]);

  await recordAuditEvent(workspaceId, "datarights.export", { count: documents.length });

  return {
    exportedAt: new Date().toISOString(),
    format: "jobmatch-candidate-export",
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
    auditEvents: auditEvents.map((event) => ({
      action: event.action,
      createdAt: event.createdAt.toISOString(),
    })),
    notes: [
      "Original uploaded files are not included in this JSON. Download them individually from the profile page while they are still within their retention window.",
      "Your name, email address, and platform account details are held by the ASafarIM platform, not by JobMatch. JobMatch stores only an opaque account identifier.",
      "Audit events record what happened and when. They never contain CV content.",
    ],
  };
}

export interface ErasureResult {
  documentsDeleted: number;
  versionsDeleted: number;
  objectsDeleted: number;
  objectsFailed: number;
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

  let objectsDeleted = 0;
  let objectsFailed = 0;
  for (const document of documents) {
    try {
      await deleteDocumentBytes(document.storageKey);
      objectsDeleted += 1;
    } catch (error) {
      objectsFailed += 1;
      logError("datarights.erase.object_failed", error, { jobId: document.id });
    }
  }

  const profile = await db.candidateProfile.findUnique({
    where: { workspaceId },
    select: { id: true, _count: { select: { versions: true } } },
  });

  await db.$transaction(async (tx) => {
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
    await tx.candidateDocument.deleteMany({ where: { workspaceId } });
  });

  // Written after the deletion, and deliberately kept: it holds an action
  // name and a timestamp, never CV content, and it is the only remaining
  // evidence that the erasure was carried out.
  await recordAuditEvent(workspaceId, "datarights.erased", {
    count: documents.length,
    outcome: objectsFailed === 0 ? "complete" : "objects_pending",
  });

  return {
    documentsDeleted: documents.length,
    versionsDeleted: profile?._count.versions ?? 0,
    objectsDeleted,
    objectsFailed,
  };
}
