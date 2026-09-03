import "server-only";
import { getJobmatchDb } from "../db/client";
import { EXTRACTOR_NAME, EXTRACTOR_VERSION, extractText } from "../extraction/text";
import {
  PROFILE_EXTRACTOR_NAME,
  PROFILE_EXTRACTOR_VERSION,
  extractProfileFromText,
} from "../extraction/profileExtractor";
import { logError, log } from "../observability/logger";
import { createVersion } from "../profile/versions";
import { recordAuditEvent } from "../workspace";
import {
  type SupportedContentType,
  safeDisplayFilename,
  validateUpload,
} from "./fileType";
import {
  MAX_EXTRACTION_ATTEMPTS,
  nextStatusAfterExtractionFailure,
  mayExtract,
} from "./pipeline";
import { createScanner, decideFromVerdict } from "./scanner";
import {
  buildDocumentKey,
  deleteDocumentBytes,
  hashBytes,
  putDocumentBytes,
  readDocumentBytes,
  retainUntil,
} from "./storage";

/**
 * The upload pipeline, wired together (JM-017 / JM-018 / JM-019).
 *
 * The ordering here is the security property, so it is worth stating
 * plainly: validate the bytes, store them, scan them, and only then — if
 * and only if the verdict was clean — extract. There is no path through
 * this file that reaches `extractText` without a `CLEAN` status, and
 * `mayExtract` is asserted again at the top of the extraction step rather
 * than assumed from the call order.
 */

export type UploadOutcome =
  | { ok: true; documentId: string; status: string }
  | { ok: false; reasonCode: string };

export async function uploadDocument(
  workspaceId: string,
  bytes: Uint8Array,
  declaredContentType: string | null,
  filename: string,
): Promise<UploadOutcome> {
  const db = getJobmatchDb();

  const validation = validateUpload(bytes, declaredContentType);
  if (!validation.ok) {
    // Rejected before anything is stored: an unsupported or oversized file
    // never becomes an object we then have to remember to clean up.
    await recordAuditEvent(workspaceId, "document.upload.rejected", {
      reasonCode: validation.reason,
    });
    return { ok: false, reasonCode: validation.reason };
  }

  const contentHash = hashBytes(bytes);
  const storageKey = buildDocumentKey(workspaceId, validation.extension);

  await putDocumentBytes(storageKey, bytes, validation.contentType);

  const document = await db.candidateDocument.create({
    data: {
      workspaceId,
      storageKey,
      originalFilename: safeDisplayFilename(filename),
      contentType: validation.contentType,
      byteSize: bytes.length,
      contentHash,
      status: "UPLOADED",
      // A mismatch between the declared and actual type is recorded but is
      // not on its own a rejection — browsers get this wrong innocently all
      // the time. It is the sniffed type that governs everything after.
      reasonCode: validation.declaredMismatch ? "DECLARED_TYPE_MISMATCH" : null,
      retainUntil: retainUntil(),
    },
    select: { id: true },
  });

  await recordAuditEvent(workspaceId, "document.uploaded", {
    jobId: document.id,
    count: bytes.length,
  });

  const status = await scanDocument(workspaceId, document.id, bytes);
  return { ok: true, documentId: document.id, status };
}

/** Scan and record the verdict. Returns the resulting status. */
async function scanDocument(
  workspaceId: string,
  documentId: string,
  bytes: Uint8Array,
): Promise<string> {
  const db = getJobmatchDb();
  const scanner = createScanner();

  await db.candidateDocument.update({
    where: { id: documentId },
    data: { status: "SCANNING" },
  });

  const verdict = await scanner.scan(bytes);
  const decision = decideFromVerdict(verdict);

  if (!decision.advance) {
    await db.candidateDocument.update({
      where: { id: documentId },
      data: {
        status: "QUARANTINED",
        reasonCode: decision.reasonCode,
        scannerName: verdict.scannerName,
        scannedAt: new Date(),
      },
    });
    await recordAuditEvent(workspaceId, "document.quarantined", {
      jobId: documentId,
      reasonCode: decision.reasonCode,
    });
    return "QUARANTINED";
  }

  await db.candidateDocument.update({
    where: { id: documentId },
    data: {
      status: "CLEAN",
      reasonCode: null,
      scannerName: verdict.scannerName,
      scannedAt: new Date(),
    },
  });
  await recordAuditEvent(workspaceId, "document.scanned", { jobId: documentId, outcome: "clean" });
  return "CLEAN";
}

export type ExtractionResult =
  | { ok: true; versionId: string }
  | { ok: false; reasonCode: string; status: string };

/**
 * Extract text and produce a draft profile version.
 *
 * Separate from upload and re-entrant on purpose: it is the unit a
 * background worker will drive when one exists (M3 brings BullMQ in for
 * ingestion), and until then the upload route calls it directly. Either
 * way the retry budget lives in the row, so a restart does not reset it.
 */
export async function extractDocument(
  workspaceId: string,
  documentId: string,
): Promise<ExtractionResult> {
  const db = getJobmatchDb();

  const document = await db.candidateDocument.findFirst({
    where: { id: documentId, workspaceId, deletedAt: null },
  });
  if (!document) return { ok: false, reasonCode: "EXTRACTION_ERROR", status: "FAILED" };

  // Re-asserted rather than assumed from the caller's ordering. This is the
  // line that makes "no parser sees unscanned bytes" true regardless of who
  // calls this function or in what order.
  if (!mayExtract(document.status)) {
    return { ok: false, reasonCode: document.reasonCode ?? "EXTRACTION_ERROR", status: document.status };
  }

  const attempts = document.extractionAttempts + 1;
  await db.candidateDocument.update({
    where: { id: documentId },
    data: { status: "EXTRACTING", extractionAttempts: attempts, extractionStartedAt: new Date() },
  });

  const stored = await readDocumentBytes(document.storageKey);
  if (!stored) {
    return failExtraction(workspaceId, documentId, attempts, "EXTRACTION_ERROR");
  }

  const extracted = await extractText(stored.bytes, document.contentType as SupportedContentType);
  if (!extracted.ok) {
    // NO_TEXT_LAYER is terminal on the first attempt rather than retried:
    // re-running the same parser on the same bytes cannot invent a text
    // layer, and OCR is a separate path (see ocr.ts) that is not wired yet.
    if (extracted.reasonCode === "NO_TEXT_LAYER") {
      await db.candidateDocument.update({
        where: { id: documentId },
        data: { status: "FAILED", reasonCode: "NO_TEXT_LAYER" },
      });
      await recordAuditEvent(workspaceId, "document.extraction.failed", {
        jobId: documentId,
        reasonCode: "NO_TEXT_LAYER",
      });
      return { ok: false, reasonCode: "NO_TEXT_LAYER", status: "FAILED" };
    }
    return failExtraction(workspaceId, documentId, attempts, extracted.reasonCode);
  }

  try {
    const profile = extractProfileFromText(extracted.text);

    const version = await createVersion({
      workspaceId,
      content: profile.content,
      confidence: profile.confidence,
      origin: "EXTRACTED",
      // Both extractors are recorded: the text layer and the profile rules
      // are versioned independently, and a change to either makes a past
      // version non-comparable.
      extractorName: `${EXTRACTOR_NAME}+${PROFILE_EXTRACTOR_NAME}`,
      extractorVersion: `${EXTRACTOR_VERSION}+${PROFILE_EXTRACTOR_VERSION}`,
      documentId,
      sourceContentHash: document.contentHash,
    });

    await db.candidateDocument.update({
      where: { id: documentId },
      data: { status: "EXTRACTED", reasonCode: null },
    });

    log.info("document.extracted", {
      jobId: documentId,
      // Length only. The extracted text itself is CV content and never
      // reaches a log line.
      count: extracted.characters,
    });

    return { ok: true, versionId: version.id };
  } catch (error) {
    logError("document.extraction.error", error, { jobId: documentId });
    return failExtraction(workspaceId, documentId, attempts, "EXTRACTION_ERROR");
  }
}

async function failExtraction(
  workspaceId: string,
  documentId: string,
  attempts: number,
  reasonCode: string,
): Promise<ExtractionResult> {
  const db = getJobmatchDb();
  const status = nextStatusAfterExtractionFailure(attempts);

  await db.candidateDocument.update({
    where: { id: documentId },
    data: { status, reasonCode: reasonCode as never },
  });
  await recordAuditEvent(workspaceId, "document.extraction.failed", {
    jobId: documentId,
    reasonCode,
    attempt: attempts,
  });

  return { ok: false, reasonCode, status };
}

export { MAX_EXTRACTION_ATTEMPTS };

export interface DocumentSummary {
  id: string;
  originalFilename: string;
  contentType: string;
  byteSize: number;
  status: string;
  reasonCode: string | null;
  uploadedAt: Date;
  retainUntil: Date | null;
}

export async function listDocuments(workspaceId: string): Promise<DocumentSummary[]> {
  const db = getJobmatchDb();
  return db.candidateDocument.findMany({
    where: { workspaceId, deletedAt: null },
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true,
      originalFilename: true,
      contentType: true,
      byteSize: true,
      status: true,
      reasonCode: true,
      uploadedAt: true,
      retainUntil: true,
    },
  });
}

/**
 * Delete a document: the stored bytes first, then the row.
 *
 * That order matters. If the row goes first and the object delete then
 * fails, the bytes are orphaned with nothing left pointing at them — a CV
 * sitting in a bucket that no erasure request can ever find again.
 */
export async function deleteDocument(workspaceId: string, documentId: string): Promise<boolean> {
  const db = getJobmatchDb();
  const document = await db.candidateDocument.findFirst({
    where: { id: documentId, workspaceId, deletedAt: null },
    select: { id: true, storageKey: true },
  });
  if (!document) return false;

  await deleteDocumentBytes(document.storageKey);
  await db.candidateDocument.delete({ where: { id: document.id } });

  await recordAuditEvent(workspaceId, "document.deleted", { jobId: documentId });
  return true;
}
