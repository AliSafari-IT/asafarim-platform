import "server-only";
import { NextResponse } from "next/server";
import { MAX_ATTACHMENTS_PER_EVENT, MAX_ATTACHMENTS_TOTAL_BYTES } from "./attachments";
import type { IncomingFile, TimelineFailure } from "./service";

/**
 * Request and response helpers shared by the timeline routes. A body is
 * JSON, or multipart with the JSON in a `payload` field and up to
 * MAX_ATTACHMENTS_PER_EVENT `file` fields. Errors carry a stable `code` and
 * never echo what was submitted.
 */

export type ReadBody = { ok: true; body: unknown; files: IncomingFile[] } | { ok: false; response: NextResponse };

const bad = (error: string, code = "INVALID_REQUEST") => NextResponse.json({ error, code }, { status: 400 });

export async function readBody(request: Request, { allowFiles }: { allowFiles: boolean }): Promise<ReadBody> {
  const type = request.headers.get("content-type") ?? "";
  if (allowFiles && type.toLowerCase().startsWith("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return { ok: false, response: bad("Invalid upload.") };
    }
    const payload = form.get("payload");
    let body: unknown = {};
    if (typeof payload === "string") {
      try {
        body = JSON.parse(payload);
      } catch {
        return { ok: false, response: bad("Invalid request body.") };
      }
    }
    const raw = form.getAll("file").filter((v): v is File => v instanceof File);
    if (raw.length > MAX_ATTACHMENTS_PER_EVENT) return { ok: false, response: bad(`Attach at most ${MAX_ATTACHMENTS_PER_EVENT} files.`, "TOO_MANY_FILES") };
    if (raw.reduce((n, f) => n + f.size, 0) > MAX_ATTACHMENTS_TOTAL_BYTES) return { ok: false, response: bad("These files are larger than 20 MB together.", "TOTAL_TOO_LARGE") };
    const files: IncomingFile[] = [];
    for (const file of raw) files.push({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    return { ok: true, body, files };
  }
  try {
    return { ok: true, body: await request.json(), files: [] };
  } catch {
    return { ok: false, response: bad("Invalid request body.") };
  }
}

export function invalid(error: string, fields: string[]) {
  return NextResponse.json({ error, code: "INVALID_FIELDS", fields }, { status: 400 });
}

const FILE_MESSAGES: Record<string, string> = {
  TOO_MANY_FILES: `Attach at most ${MAX_ATTACHMENTS_PER_EVENT} files to one update.`,
  FILE_TOO_LARGE: "A file is larger than 10 MB.",
  TOTAL_TOO_LARGE: "These files are larger than 20 MB together.",
  EMPTY_FILE: "A file is empty.",
  UNSUPPORTED_TYPE: "Only screenshots (PNG, JPEG, WebP), PDFs and saved emails (.eml) can be attached.",
  REJECTED_FILE: "A file didn't pass the safety check and wasn't saved.",
};

export function failureResponse(failure: TimelineFailure) {
  switch (failure.reason) {
    case "not_found":
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    case "already_recorded":
      return NextResponse.json({ error: "A submission is already recorded for this application. Edit it instead.", code: "ALREADY_RECORDED" }, { status: 409 });
    case "not_recorded":
      return NextResponse.json({ error: "No external submission is recorded for this application.", code: "NOT_RECORDED" }, { status: 409 });
    case "recorded_submission":
      return NextResponse.json({ error: "Change the recorded submission with Edit recorded details.", code: "RECORDED_SUBMISSION" }, { status: 409 });
    case "files":
      return NextResponse.json({ error: FILE_MESSAGES[failure.problem] ?? "A file can't be attached.", code: failure.problem, file: failure.file ?? null }, { status: 400 });
    case "scanner_unavailable":
      return NextResponse.json({ error: "Files can't be checked right now, so nothing was saved. Try again in a few minutes.", code: "SCANNER_UNAVAILABLE" }, { status: 503 });
    case "storage":
      return NextResponse.json({ error: "A file couldn't be stored or removed. Nothing else changed. Try again.", code: "STORAGE" }, { status: 503 });
  }
}
