import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { testResults } from "@/db/schema";
import { isProjectViewable } from "@/lib/app-access";
import {
  buildRunArtifactBundle,
  NonTerminalResultError,
  type BundleSourceRow,
} from "@/lib/run-artifact-bundle";

export const dynamic = "force-dynamic";

/**
 * GET /api/results/{resultId}/bundle
 *
 * Exports one stored result as a versioned cross-app artifact bundle for
 * TasksAI to diagnose (issue #258). Access mirrors the Results page: a locked
 * private app's bundle is withheld (403) unless the caller presents the
 * machine-to-machine service token (`TESTORA_BUNDLE_READ_TOKEN`).
 */
function hasServiceToken(request: Request): boolean {
  const expected = process.env.TESTORA_BUNDLE_READ_TOKEN;
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match?.[1]) return false;
  const got = Buffer.from(match[1]);
  const want = Buffer.from(expected);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ resultId: string }> },
) {
  const { resultId } = await params;

  const row = await db.query.testResults.findFirst({
    where: eq(testResults.id, resultId),
    with: {
      case: {
        with: {
          fixture: {
            with: { suite: { with: { functionalRequirement: true } } },
          },
        },
      },
    },
  });

  if (!row) {
    return NextResponse.json({ error: "Result not found" }, { status: 404 });
  }

  const fixture = row.case?.fixture;
  const suite = fixture?.suite;
  const requirement = suite?.functionalRequirement;
  const projectId = requirement?.projectId ?? null;

  if (!hasServiceToken(request) && !(await isProjectViewable(projectId))) {
    return NextResponse.json({ error: "App is locked" }, { status: 403 });
  }

  const previous = await db.query.testResults.findFirst({
    where: and(
      eq(testResults.caseId, row.caseId),
      eq(testResults.status, "passed"),
      lt(testResults.createdAt, row.createdAt),
    ),
    orderBy: desc(testResults.createdAt),
    columns: { id: true, createdAt: true },
  });

  const source: BundleSourceRow = {
    id: row.id,
    status: row.status,
    runIndex: row.runIndex,
    durationMs: row.durationMs,
    errorMessage: row.errorMessage,
    createdAt:
      row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    details: (row.details as Record<string, unknown> | null) ?? null,
    caseId: row.caseId,
    caseTitle: row.case?.title ?? row.caseId,
    fixtureId: fixture?.fixtureId ?? "",
    fixtureTitle: fixture?.title ?? "",
    suiteId: suite?.suiteId ?? "",
    suiteTitle: suite?.title ?? "",
    requirementId: requirement?.id ?? "",
    requirementTitle: requirement?.title ?? "",
    projectId: projectId ?? "",
    previousPass: previous
      ? {
          resultId: previous.id,
          createdAt:
            previous.createdAt instanceof Date
              ? previous.createdAt.toISOString()
              : String(previous.createdAt),
        }
      : null,
  };

  try {
    const bundle = buildRunArtifactBundle(source);
    return NextResponse.json(bundle);
  } catch (error) {
    if (error instanceof NonTerminalResultError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
