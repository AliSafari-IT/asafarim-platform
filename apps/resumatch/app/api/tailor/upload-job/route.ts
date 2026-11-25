import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "../../../../lib/db/generated";
import { getJobmatchDb } from "../../../../lib/db/client";
import { explainReasonCode } from "../../../../lib/documents/pipeline";
import { createScanner, decideFromVerdict } from "../../../../lib/documents/scanner";
import { safeDisplayFilename, validateUpload } from "../../../../lib/documents/fileType";
import { extractText, MAX_EXTRACTED_CHARACTERS } from "../../../../lib/extraction/text";
import { inferJobMetaWithFallback } from "../../../../lib/tailoring/jobMetaAi/degraded";
import {
  MAX_JOB_FILES,
  MAX_JOB_FILES_TOTAL_BYTES,
  combineJobFileTexts,
  uploadSourceUrl,
  type SourceFile,
} from "../../../../lib/tailoring/jobFiles";
import { getCurrentWorkspace } from "../../../../lib/workspace";
import { openDraft } from "../../../../lib/tailoring/drafts/store";

export const dynamic = "force-dynamic";
// Up to five files, parsed side by side, each under the parse worker's own
// 20 s limit (EXTRACTION_TIMEOUT_MS), plus the scan and one metadata call.
export const maxDuration = 60;

/** One file's outcome, returned so the page can mark the file that failed. */
type FileResult =
  | { name: string; ok: true; contentType: string; bytes: number; text: string }
  | { name: string; ok: false; code: string; error: string };

/**
 * Upload the job description as one or more files (PDF, DOCX, or plain
 * text, which includes Markdown and JSON) as an alternative to
 * `/api/tailor/fetch-job` and `/api/tailor/paste-job` (issue #460, part of
 * #458; several files since 0.6.18). Every file goes through the same
 * byte-sniffing/size validation (lib/documents/fileType.ts), malware scan
 * (lib/documents/scanner.ts — JM-018's "an unscanned document is treated
 * exactly like an infected one"), and text extraction in the killable
 * parse worker (lib/extraction/text.ts) the CV-upload path uses. Unlike a
 * CV upload, the original bytes are never written to storage and there is
 * no `CandidateDocument` row — a job description carries none of a CV's
 * retention/erasure requirements, and this route's only output is
 * `TargetJob.rawText` (the files' text joined, see lib/tailoring/jobFiles.ts)
 * plus the list of file names in `sourceFiles`.
 *
 * All or nothing: if any file can't be read, no job is created and the
 * answer names each file's problem, so the candidate can remove or replace
 * that one and try again.
 */
export async function POST(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  const files = form.getAll("file").filter((value): value is File => value instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "A file is required." }, { status: 400 });
  }
  if (files.length > MAX_JOB_FILES) {
    return NextResponse.json(
      { error: `Upload at most ${MAX_JOB_FILES} files for one job.`, code: "TOO_MANY_FILES" },
      { status: 400 },
    );
  }
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_JOB_FILES_TOTAL_BYTES) {
    return NextResponse.json(
      { error: "These files are larger than 20 MB together.", code: "TOTAL_TOO_LARGE" },
      { status: 400 },
    );
  }

  const scanner = createScanner();
  const results = await Promise.all(
    files.map(async (file): Promise<FileResult> => {
      const name = safeDisplayFilename(file.name || "job-description");
      const fail = (code: string): FileResult => ({ name, ok: false, code, error: explainReasonCode(code) });

      const bytes = new Uint8Array(await file.arrayBuffer());
      const validation = validateUpload(bytes, file.type || null);
      if (!validation.ok) return fail(validation.reason);

      const decision = decideFromVerdict(await scanner.scan(bytes));
      if (!decision.advance) return fail(decision.reasonCode);

      const extraction = await extractText(bytes, validation.contentType);
      if (!extraction.ok) return fail(extraction.reasonCode);
      return { name, ok: true, contentType: validation.contentType, bytes: bytes.length, text: extraction.text };
    }),
  );

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    const status = results.some((r) => !r.ok && ["UNSUPPORTED_TYPE", "EMPTY_FILE", "ENCRYPTED_DOCUMENT", "FILE_TOO_LARGE"].includes(r.code))
      ? 400
      : 422;
    return NextResponse.json(
      {
        // One file: its own message, as before. Several: the list says which.
        error: files.length === 1 && !results[0].ok ? results[0].error : "Some of these files could not be read.",
        code: files.length === 1 && !results[0].ok ? results[0].code : "FILES_UNREADABLE",
        files: results.map((r) => (r.ok ? { name: r.name, ok: true } : { name: r.name, ok: false, code: r.code, error: r.error })),
      },
      { status },
    );
  }

  const read = results.filter((r): r is Extract<FileResult, { ok: true }> => r.ok);
  const rawText = combineJobFileTexts(read, MAX_EXTRACTED_CHARACTERS);
  const sourceFiles: SourceFile[] = read.map((r) => ({
    name: r.name,
    contentType: r.contentType,
    bytes: r.bytes,
    characters: r.text.length,
  }));

  // Pre-minted so the metadata call's cost event names this job (issue #586).
  const targetJobId = randomUUID();
  const meta = await inferJobMetaWithFallback(workspace.id, rawText, { targetJobId });

  const db = getJobmatchDb();
  const targetJob = await db.targetJob.create({
    data: {
      id: targetJobId,
      workspaceId: workspace.id,
      // No fetch and no stored file — the sentinel just names the source,
      // consistent with paste-job's "pasted://job-description" (see #458).
      sourceUrl: uploadSourceUrl(read.map((r) => r.name)),
      sourceFiles: sourceFiles as unknown as Prisma.InputJsonValue,
      rawText,
      title: meta.title,
      employer: meta.employer,
      status: "FETCHED",
    },
    select: { id: true, status: true },
  });

  // Kept as an unfinished Tailor run until the CV is saved or discarded.
  await openDraft(workspace.id, targetJob.id);

  return NextResponse.json({
    id: targetJob.id,
    status: targetJob.status,
    title: meta.title,
    employer: meta.employer,
    snippet: rawText.slice(0, 400),
    sourceFiles: sourceFiles.map((f) => ({ name: f.name })),
  });
}
