import { NextResponse } from "next/server";
import { logError } from "../../../lib/observability/logger";
import { ProtectedAttributeError, parseProfileContent } from "../../../lib/profile/contract";
import {
  PROFILE_EXTRACTOR_NAME,
  PROFILE_EXTRACTOR_VERSION,
} from "../../../lib/extraction/profileExtractor";
import {
  confirmVersion,
  createVersion,
  getLatestVersion,
  listVersions,
} from "../../../lib/profile/versions";
import { getCurrentWorkspace } from "../../../lib/workspace";

export const dynamic = "force-dynamic";

export async function GET() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const [latest, versions] = await Promise.all([
    getLatestVersion(workspace.id),
    listVersions(workspace.id),
  ]);
  return NextResponse.json({ latest, versions });
}

/**
 * Save a correction, or create a profile by hand.
 *
 * Always a new version — this route never updates one in place. A
 * correction records what it corrected, so the profile that produced a past
 * match is still there to explain it.
 */
export async function POST(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { content, parentVersionId, confirm } = (body ?? {}) as {
    content?: unknown;
    parentVersionId?: string | null;
    confirm?: boolean;
  };

  let parsed;
  try {
    parsed = parseProfileContent(content);
  } catch (error) {
    if (error instanceof ProtectedAttributeError) {
      // Named explicitly rather than folded into a generic 400: a client
      // sending one of these is a bug worth surfacing, not a typo.
      return NextResponse.json(
        {
          error:
            "JobMatch does not store age, nationality, gender, or similar attributes, and will not accept them.",
          keys: error.keys,
        },
        { status: 422 },
      );
    }
    return NextResponse.json({ error: "That profile could not be saved as written." }, { status: 422 });
  }

  try {
    const version = await createVersion({
      workspaceId: workspace.id,
      content: parsed,
      origin: parentVersionId ? "CORRECTED" : "MANUAL",
      // A hand-edited version is authored by the person, not by a parser.
      // Recording the extractor that seeded it would misattribute the
      // content; recording "manual" keeps the lineage honest.
      extractorName: parentVersionId ? `${PROFILE_EXTRACTOR_NAME}+manual` : "manual",
      extractorVersion: parentVersionId ? PROFILE_EXTRACTOR_VERSION : "1.0.0",
      parentVersionId: parentVersionId ?? null,
    });

    if (confirm) await confirmVersion(workspace.id, version.id);

    return NextResponse.json({ versionId: version.id, versionNumber: version.versionNumber });
  } catch (error) {
    logError("profile.version.create_failed", error);
    return NextResponse.json({ error: "This profile could not be saved." }, { status: 500 });
  }
}

/** Confirm an existing version — the gate matching reads. */
export async function PATCH(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  let versionId: unknown;
  try {
    ({ versionId } = (await request.json()) as { versionId?: unknown });
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof versionId !== "string" || versionId.length === 0) {
    return NextResponse.json({ error: "A versionId is required." }, { status: 400 });
  }

  const confirmed = await confirmVersion(workspace.id, versionId);
  if (!confirmed) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ confirmed: true });
}
