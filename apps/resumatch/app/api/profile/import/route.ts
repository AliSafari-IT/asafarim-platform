import { NextResponse } from "next/server";
import { logError } from "../../../../lib/observability/logger";
import { IMPORT_EXTRACTOR_NAME, IMPORT_EXTRACTOR_VERSION, MAX_IMPORT_BYTES, readProfileExport } from "../../../../lib/profile/exportImport";
import { profileHasChanges } from "../../../../lib/profile/changes";
import { createVersion, getLatestVersion } from "../../../../lib/profile/versions";
import { getCurrentWorkspace, recordAuditEvent } from "../../../../lib/workspace";

export const dynamic = "force-dynamic";

/**
 * Import a profile from a ResuMatch export (#942).
 *
 * multipart/form-data:
 * - `file`: the `resumatch-export.json` archive.
 * - `mode`: `preview` (default) reads the file and says what would be
 *   imported, writing nothing; `import` writes it.
 * - `versionId`: an explicit choice of source version, needed when the
 *   export has no valid confirmed version.
 * - `replaceExisting`: must be `true` to import when this workspace already
 *   has a profile. The current versions stay in the history either way.
 *
 * The file is read again on `import`, never trusted from the preview. The
 * import is always a new, unconfirmed version owned by this workspace: the
 * source's ids and confirmation state never carry over, and nothing else
 * from the archive is written.
 */
export async function POST(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_IMPORT_BYTES * 1.1) {
    return NextResponse.json({ code: "FILE_TOO_LARGE" }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ code: "INVALID_REQUEST" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ code: "INVALID_REQUEST" }, { status: 400 });
  const mode = form.get("mode") === "import" ? "import" : "preview";
  const versionId = typeof form.get("versionId") === "string" ? (form.get("versionId") as string) : null;
  const replaceExisting = form.get("replaceExisting") === "true";

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = readProfileExport(bytes, versionId || null);
  if (!result.ok) {
    return NextResponse.json(
      { code: result.code, field: result.field, versions: result.versions },
      { status: result.code === "FILE_TOO_LARGE" ? 413 : 422 },
    );
  }

  try {
    const latest = await getLatestVersion(workspace.id);
    const destination = {
      hasProfile: latest !== null,
      latestVersionNumber: latest?.versionNumber ?? null,
      latestIsConfirmed: latest?.isConfirmed ?? false,
    };

    if (mode === "preview") return NextResponse.json({ preview: result.preview, destination });

    // Never a silent overwrite: an existing profile needs an explicit yes.
    if (latest && !replaceExisting) {
      return NextResponse.json({ code: "DESTINATION_HAS_PROFILE", destination }, { status: 409 });
    }
    if (latest && !profileHasChanges(latest.content, result.content)) {
      return NextResponse.json({ versionId: latest.id, versionNumber: latest.versionNumber, unchanged: true });
    }

    const version = await createVersion({
      workspaceId: workspace.id,
      content: result.content,
      origin: "MANUAL",
      extractorName: IMPORT_EXTRACTOR_NAME,
      extractorVersion: IMPORT_EXTRACTOR_VERSION,
      parentVersionId: null,
    });
    await recordAuditEvent(workspace.id, "profile.imported", {
      outcome: result.preview.usedConfirmedVersion ? "confirmed_version" : "selected_version",
      count: version.versionNumber,
    });

    return NextResponse.json({ versionId: version.id, versionNumber: version.versionNumber, unchanged: false });
  } catch (error) {
    logError("profile.import.failed", error);
    return NextResponse.json({ code: "IMPORT_FAILED" }, { status: 500 });
  }
}
