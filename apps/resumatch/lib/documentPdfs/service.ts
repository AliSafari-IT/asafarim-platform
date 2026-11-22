import "server-only";
import { randomUUID } from "node:crypto";
import { getJobmatchDb } from "../db/client";
import type { DocumentPdfKind } from "../db/generated";
import { deleteDocumentBytes, hashBytes, putDocumentBytes, readDocumentBytes } from "../documents/storage";
import { logError } from "../observability/logger";
import { cvShowsPhoto } from "../profile/photo";
import { getProfilePhoto } from "../profile/photoStore";
import { parseTailoredResumeContent } from "../tailoring/ai/schema";
import { parseCoverLetterContent } from "../tailoring/ai/coverLetter/schema";
import { isOutputLanguage, type OutputLanguage } from "../tailoring/language";
import { recordAuditEvent } from "../workspace";
import { pdfFilename } from "./filename";
import { cvFingerprint, letterFingerprint } from "./fingerprint";
import { PdfRenderError, PdfRendererUnavailableError, renderPagePdf, type RenderRequest } from "./render";

/**
 * Rendered PDFs of a tailored CV and its cover letter (send-application.md).
 *
 * Each PDF is an immutable row plus a private object, created only on the
 * candidate's request ("Create PDFs"). The bytes follow the candidate-
 * document rules (lib/documents/storage.ts): a derived key, private ACL,
 * served through an owner-checked route, deletes verified.
 */

const KEY_PREFIX = "resumatch/document-pdfs";
/** A CV or one-page letter is far below this; anything larger is a bug. */
export const MAX_PDF_BYTES = 8 * 1024 * 1024;

const LETTER_LABEL: Record<OutputLanguage, string> = {
  en: "Cover letter",
  nl: "Motivatiebrief",
  fr: "Lettre de motivation",
  de: "Anschreiben",
};

export function buildPdfKey(workspaceId: string): string {
  return `${KEY_PREFIX}/${workspaceId}/${randomUUID()}.pdf`;
}

export interface PdfSummary {
  id: string;
  kind: DocumentPdfKind;
  filename: string;
  byteSize: number;
  contentHash: string;
  createdAt: Date;
  tailoredResumeId: string | null;
  coverLetterId: string | null;
  sourceFingerprint: string;
}

const PDF_SELECT = {
  id: true,
  kind: true,
  filename: true,
  byteSize: true,
  contentHash: true,
  createdAt: true,
  tailoredResumeId: true,
  coverLetterId: true,
  sourceFingerprint: true,
} as const;

/** What a CV and its letter would render from right now. */
export interface PdfSources {
  tailoredResumeId: string;
  targetJobId: string;
  employer: string | null;
  cv: { fingerprint: string; filename: string };
  letter: { id: string; fingerprint: string; filename: string } | null;
}

export async function loadPdfSources(workspaceId: string, tailoredResumeId: string): Promise<PdfSources | null> {
  const db = getJobmatchDb();
  const row = await db.tailoredResume.findFirst({
    where: { id: tailoredResumeId, workspaceId },
    select: {
      id: true,
      content: true,
      outputLanguage: true,
      showPhoto: true,
      skillsLayout: true,
      skillsParagraph: true,
      targetJobId: true,
      profileVersion: { select: { content: true } },
      targetJob: { select: { title: true, employer: true, structuredFields: true } },
      coverLetter: {
        select: {
          id: true,
          content: true,
          outputLanguage: true,
          createdAt: true,
          profileVersion: { select: { content: true } },
        },
      },
    },
  });
  if (!row) return null;

  const photo = await getProfilePhoto(workspaceId);
  const shown = photo && cvShowsPhoto(photo, row.showPhoto) ? { contentHash: photo.contentHash, shape: photo.shape } : null;
  const cvContent = parseTailoredResumeContent(row.content);

  const letter = row.coverLetter;
  let letterSource: PdfSources["letter"] = null;
  if (letter) {
    const letterContent = parseCoverLetterContent(letter.content);
    const language: OutputLanguage = isOutputLanguage(letter.outputLanguage) ? letter.outputLanguage : "en";
    letterSource = {
      id: letter.id,
      fingerprint: letterFingerprint({
        content: letter.content,
        outputLanguage: letter.outputLanguage,
        profileVersionContent: letter.profileVersion.content,
        job: { title: row.targetJob.title, employer: row.targetJob.employer, structuredFields: row.targetJob.structuredFields },
        createdAt: letter.createdAt.toISOString(),
      }),
      filename: pdfFilename(letterContent.fullName ?? cvContent.fullName, LETTER_LABEL[language], row.targetJob.employer),
    };
  }

  return {
    tailoredResumeId: row.id,
    targetJobId: row.targetJobId,
    employer: row.targetJob.employer,
    cv: {
      fingerprint: cvFingerprint({
        content: row.content,
        outputLanguage: row.outputLanguage,
        skillsLayout: row.skillsLayout,
        skillsParagraph: row.skillsParagraph,
        profileVersionContent: row.profileVersion.content,
        photo: shown,
      }),
      filename: pdfFilename(cvContent.fullName, "CV", row.targetJob.employer),
    },
    letter: letterSource,
  };
}

export interface DocumentPdfState {
  latest: PdfSummary | null;
  /** True when `latest` was rendered from the document as it is now. */
  current: boolean;
}

export interface PdfStatus {
  sources: PdfSources;
  cv: DocumentPdfState;
  /** Null when the CV has no cover letter. */
  letter: DocumentPdfState | null;
  /** Both PDFs exist (they may be older than the documents). */
  ready: boolean;
}

export async function getPdfStatus(workspaceId: string, tailoredResumeId: string): Promise<PdfStatus | null> {
  const sources = await loadPdfSources(workspaceId, tailoredResumeId);
  if (!sources) return null;
  const db = getJobmatchDb();
  const [cvPdf, letterPdf] = await Promise.all([
    db.documentPdf.findFirst({
      where: { workspaceId, kind: "CV", tailoredResumeId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: PDF_SELECT,
    }),
    sources.letter
      ? db.documentPdf.findFirst({
          where: { workspaceId, kind: "COVER_LETTER", coverLetterId: sources.letter.id },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: PDF_SELECT,
        })
      : Promise.resolve(null),
  ]);
  const cv = { latest: cvPdf, current: cvPdf?.sourceFingerprint === sources.cv.fingerprint };
  const letter = sources.letter
    ? { latest: letterPdf, current: letterPdf?.sourceFingerprint === sources.letter.fingerprint }
    : null;
  return { sources, cv, letter, ready: Boolean(cv.latest && letter?.latest) };
}

export type CreatePdfsOutcome =
  | { ok: true; status: PdfStatus; created: DocumentPdfKind[] }
  | { ok: false; reason: "not_found" | "no_cover_letter" | "renderer_unavailable" | "render_failed" | "storage_failed" };

/**
 * Make a PDF of the CV and of its letter, unless an up-to-date one exists.
 * Never replaces or edits an existing PDF: a stale one stays (a draft or a
 * sent email may point at it) and a new row is added beside it.
 */
export async function createPdfs(
  workspaceId: string,
  tailoredResumeId: string,
  cookieHeader: string | null,
  render: (request: RenderRequest) => Promise<Uint8Array> = renderPagePdf,
): Promise<CreatePdfsOutcome> {
  const status = await getPdfStatus(workspaceId, tailoredResumeId);
  if (!status) return { ok: false, reason: "not_found" };
  if (!status.sources.letter || !status.letter) return { ok: false, reason: "no_cover_letter" };

  const jobs: { kind: DocumentPdfKind; request: RenderRequest; fingerprint: string; filename: string; coverLetterId: string | null }[] = [];
  if (!status.cv.current) {
    jobs.push({
      kind: "CV",
      request: { path: `/tailor/${encodeURIComponent(tailoredResumeId)}/preview`, readySelector: ".rm-cv", cookieHeader },
      fingerprint: status.sources.cv.fingerprint,
      filename: status.sources.cv.filename,
      coverLetterId: null,
    });
  }
  if (!status.letter.current) {
    const letter = status.sources.letter;
    jobs.push({
      kind: "COVER_LETTER",
      request: { path: `/cover-letter/${encodeURIComponent(letter.id)}/preview`, readySelector: '[data-testid="cover-letter"]', cookieHeader },
      fingerprint: letter.fingerprint,
      filename: letter.filename,
      coverLetterId: letter.id,
    });
  }

  const db = getJobmatchDb();
  const created: DocumentPdfKind[] = [];
  for (const job of jobs) {
    let bytes: Uint8Array;
    try {
      bytes = await render(job.request);
    } catch (error) {
      if (error instanceof PdfRendererUnavailableError) return { ok: false, reason: "renderer_unavailable" };
      // `reasonCode` is on the log allow-list; `kind`/`code` were redacted,
      // which left production logs unable to say why a render failed.
      logError("documentPdf.render.failed", error, {
        reasonCode: `${job.kind}:${error instanceof PdfRenderError ? error.code : "unknown"}`,
      });
      return { ok: false, reason: "render_failed" };
    }
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_PDF_BYTES || !isPdf(bytes)) {
      logError("documentPdf.render.invalid", new Error("InvalidPdf"), { reasonCode: `${job.kind}:invalid_pdf`, count: bytes.byteLength });
      return { ok: false, reason: "render_failed" };
    }

    const key = buildPdfKey(workspaceId);
    try {
      await putDocumentBytes(key, bytes, "application/pdf");
    } catch (error) {
      logError("documentPdf.store.failed", error, { reasonCode: `${job.kind}:store_failed` });
      return { ok: false, reason: "storage_failed" };
    }
    try {
      const pdf = await db.documentPdf.create({
        data: {
          workspaceId,
          kind: job.kind,
          tailoredResumeId: job.kind === "CV" ? tailoredResumeId : null,
          coverLetterId: job.coverLetterId,
          targetJobId: status.sources.targetJobId,
          sourceFingerprint: job.fingerprint,
          storageKey: key,
          filename: job.filename,
          byteSize: bytes.byteLength,
          contentHash: hashBytes(bytes),
        },
        select: { id: true },
      });
      created.push(job.kind);
      await recordAuditEvent(workspaceId, "document_pdf.created", { pdfId: pdf.id, kind: job.kind, tailoredResumeId });
    } catch (error) {
      // No row, so the object must not linger.
      await deleteDocumentBytes(key).catch(() => false);
      logError("documentPdf.row.failed", error, { reasonCode: `${job.kind}:row_failed` });
      return { ok: false, reason: "storage_failed" };
    }
  }

  const after = await getPdfStatus(workspaceId, tailoredResumeId);
  if (!after) return { ok: false, reason: "not_found" };
  return { ok: true, status: after, created };
}

export function isPdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
}

/** One PDF row, owner-checked. */
export async function findPdf(workspaceId: string, pdfId: string): Promise<(PdfSummary & { storageKey: string }) | null> {
  return getJobmatchDb().documentPdf.findFirst({
    where: { id: pdfId, workspaceId },
    select: { ...PDF_SELECT, storageKey: true },
  });
}

export type PdfBytesResult =
  | { ok: true; pdf: PdfSummary; bytes: Uint8Array }
  | { ok: false; reason: "not_found" | "missing" | "tampered" };

/** The stored bytes, checked against the hash recorded when they were made. */
export async function readPdfBytes(workspaceId: string, pdfId: string): Promise<PdfBytesResult> {
  const pdf = await findPdf(workspaceId, pdfId);
  if (!pdf) return { ok: false, reason: "not_found" };
  const object = await readDocumentBytes(pdf.storageKey);
  if (!object) return { ok: false, reason: "missing" };
  if (hashBytes(object.bytes) !== pdf.contentHash) return { ok: false, reason: "tampered" };
  const { storageKey: _key, ...summary } = pdf;
  return { ok: true, pdf: summary, bytes: object.bytes };
}

/**
 * Whether each CV (and its letter) has a PDF at all, for a whole list page
 * in two queries. Enough for the cards' "Send application" entry; the
 * composer does the full up-to-date check.
 */
export async function pdfReadiness(
  workspaceId: string,
  pairs: { tailoredResumeId: string; coverLetterId: string | null }[],
): Promise<Map<string, { cv: boolean; letter: boolean }>> {
  const result = new Map<string, { cv: boolean; letter: boolean }>();
  if (pairs.length === 0) return result;
  const letterIds = pairs.map((p) => p.coverLetterId).filter((id): id is string => Boolean(id));
  const rows = await getJobmatchDb().documentPdf.findMany({
    where: {
      workspaceId,
      OR: [
        { kind: "CV", tailoredResumeId: { in: pairs.map((p) => p.tailoredResumeId) } },
        ...(letterIds.length > 0 ? [{ kind: "COVER_LETTER" as const, coverLetterId: { in: letterIds } }] : []),
      ],
    },
    select: { kind: true, tailoredResumeId: true, coverLetterId: true },
  });
  const cvs = new Set(rows.filter((r) => r.kind === "CV").map((r) => r.tailoredResumeId));
  const letters = new Set(rows.filter((r) => r.kind === "COVER_LETTER").map((r) => r.coverLetterId));
  for (const pair of pairs) {
    result.set(pair.tailoredResumeId, { cv: cvs.has(pair.tailoredResumeId), letter: Boolean(pair.coverLetterId && letters.has(pair.coverLetterId)) });
  }
  return result;
}
