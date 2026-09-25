import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { issues } from "@/db/schema";

export interface RelatedIssueRow {
  id: string;
  title: string;
  status: "draft" | "published";
  githubUrl: string | null;
  githubNumber: number | null;
  githubState: "open" | "closed" | null;
  createdAt: Date;
}

/**
 * Other issues generated from the same test case (any status, any error) —
 * broader than the exact-fingerprint duplicate check in issue-fingerprint.ts,
 * which only catches the *identical* bug. This catches "this test has failed
 * before, differently" so a reader has the history without searching for it.
 */
export async function getRelatedIssues(
  projectId: string,
  caseId: string | null | undefined,
  excludeIssueId: string,
  limit = 5,
): Promise<RelatedIssueRow[]> {
  if (!caseId) return [];
  return db
    .select({
      id: issues.id,
      title: issues.title,
      status: issues.status,
      githubUrl: issues.githubUrl,
      githubNumber: issues.githubNumber,
      githubState: issues.githubState,
      createdAt: issues.createdAt,
    })
    .from(issues)
    .where(and(eq(issues.projectId, projectId), eq(issues.caseId, caseId), ne(issues.id, excludeIssueId)))
    .orderBy(desc(issues.createdAt))
    .limit(limit);
}

/**
 * Count of *other* issues per caseId within a project — used to show a
 * "N related" badge on the issues list without a per-row query. Keyed by
 * caseId; a caseId with only one issue (itself) is omitted since there's
 * nothing to relate it to.
 */
export async function getRelatedCounts(
  projectId: string,
): Promise<Map<string, number>> {
  const rows = await db
    .select({ caseId: issues.caseId })
    .from(issues)
    .where(eq(issues.projectId, projectId));

  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.caseId) continue;
    counts.set(row.caseId, (counts.get(row.caseId) ?? 0) + 1);
  }
  // Drop solo cases — "1 related" would just mean "itself".
  for (const [caseId, count] of counts) {
    if (count <= 1) counts.delete(caseId);
  }
  return counts;
}
