import { NextResponse } from "next/server";
import { getJobmatchDb } from "../../../../lib/db/client";
import { explainReasonCode } from "../../../../lib/documents/pipeline";
import { createScanner, decideFromVerdict } from "../../../../lib/documents/scanner";
import { safeDisplayFilename, validateUpload } from "../../../../lib/documents/fileType";
import { extractText } from "../../../../lib/extraction/text";
import { inferJobMetaWithFallback } from "../../../../lib/tailoring/jobMetaAi/degraded";
import { getCurrentWorkspace } from "../../../../lib/workspace";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Upload a PDF/DOCX/plain-text job description as an alternative to
 * `/api/tailor/fetch-job` and `/api/tailor/paste-job` (issue #460, part of
 * #458). Reuses the same byte-sniffing/size validation
 * (lib/documents/fileType.ts), malware scan
 * (lib/documents/scanner.ts — JM-018's "an unscanned document is treated
 * exactly like an infected one"), and text extraction
 * (lib/extraction/text.ts — PDF layout reconstruction / DOCX / plain text)
 * the CV-upload path already uses. Unlike a CV upload, the original bytes
 * are never written to storage and there is no `CandidateDocument` row —
 * a job description carries none of a CV's retention/erasure requirements,
 * and this route's only output is `TargetJob.rawText`, the same thing
 * `paste-job` already produces from typed text.
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

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A file is required." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validateUpload(bytes, file.type || null);
  if (!validation.ok) {
    return NextResponse.json({ error: explainReasonCode(validation.reason) }, { status: 400 });
  }

  const scanner = createScanner();
  const verdict = await scanner.scan(bytes);
  const decision = decideFromVerdict(verdict);
  if (!decision.advance) {
    return NextResponse.json({ error: explainReasonCode(decision.reasonCode) }, { status: 422 });
  }

  const extraction = await extractText(bytes, validation.contentType);
  if (!extraction.ok) {
    return NextResponse.json({ error: explainReasonCode(extraction.reasonCode) }, { status: 422 });
  }

  const meta = await inferJobMetaWithFallback(workspace.id, extraction.text);

  const db = getJobmatchDb();
  const filename = safeDisplayFilename(file.name || "job-description");
  const targetJob = await db.targetJob.create({
    data: {
      workspaceId: workspace.id,
      // No fetch and no stored file — the sentinel just names the source,
      // consistent with paste-job's "pasted://job-description" (see #458).
      sourceUrl: `upload://${filename}`,
      rawText: extraction.text,
      title: meta.title,
      employer: meta.employer,
      status: "FETCHED",
    },
    select: { id: true, status: true },
  });

  return NextResponse.json({
    id: targetJob.id,
    status: targetJob.status,
    title: meta.title,
    employer: meta.employer,
    snippet: extraction.text.slice(0, 400),
  });
}
