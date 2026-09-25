export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, ilike, isNotNull, or } from "drizzle-orm";
import { Github, ExternalLink, Link2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db/client";
import { issues, testCases, testFixtures } from "@/db/schema";
import { getProjectAccess } from "@/lib/app-access";
import { LockedApp } from "@/components/locked-app";
import { GithubStateBadge } from "@/components/issues/github-state-badge";
import { IssuesFilterBar } from "@/components/issues/issues-filter-bar";
import { getRelatedCounts } from "@/lib/related-issues";
import { LocalDateTime } from "@/components/local-date-time";
import type { ComboboxOption } from "@/components/ui/combobox";

type IssueStatusFilter = "draft" | "published" | "all";
type GithubStateFilter = "open" | "closed" | "all";

export default async function AppIssuesPage({
  params,
  searchParams,
}: {
  params: Promise<{ appId: string }>;
  searchParams: Promise<{ status?: string; gh?: string; case?: string; q?: string }>;
}) {
  const { appId } = await params;
  const sp = await searchParams;
  const access = await getProjectAccess(appId);
  if (!access.exists) notFound();
  if (access.locked) {
    return <LockedApp projectId={appId} name={access.project?.name ?? appId} />;
  }

  const statusFilter: IssueStatusFilter =
    sp.status === "draft" || sp.status === "published" ? sp.status : "all";
  const ghFilter: GithubStateFilter = sp.gh === "open" || sp.gh === "closed" ? sp.gh : "all";
  const caseFilter = sp.case && sp.case !== "all" ? sp.case : null;
  const q = sp.q?.trim() || null;

  // Every case/fixture that has at least one issue, for the filter dropdown —
  // scoped to what's actually meaningful here, not the whole test catalog.
  const caseRows = await db
    .selectDistinct({
      caseId: issues.caseId,
      caseTitle: testCases.title,
      fixtureTitle: testFixtures.title,
    })
    .from(issues)
    .leftJoin(testCases, eq(testCases.caseId, issues.caseId))
    .leftJoin(testFixtures, eq(testFixtures.fixtureId, testCases.fixtureId))
    .where(and(eq(issues.projectId, appId), isNotNull(issues.caseId)));

  const caseOptions: ComboboxOption[] = caseRows
    .filter((r): r is typeof r & { caseId: string } => r.caseId != null)
    .map((r) => ({
      value: r.caseId,
      label: r.caseTitle
        ? r.fixtureTitle
          ? `${r.fixtureTitle} — ${r.caseTitle}`
          : r.caseTitle
        : "(case removed)",
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const conditions = [eq(issues.projectId, appId)];
  if (statusFilter !== "all") conditions.push(eq(issues.status, statusFilter));
  if (ghFilter !== "all") conditions.push(eq(issues.githubState, ghFilter));
  if (caseFilter) conditions.push(eq(issues.caseId, caseFilter));
  if (q) {
    const like = `%${q}%`;
    const textMatch = or(ilike(issues.title, like), ilike(issues.body, like));
    if (textMatch) conditions.push(textMatch);
  }

  const rows = await db
    .select({
      id: issues.id,
      title: issues.title,
      status: issues.status,
      caseId: issues.caseId,
      githubUrl: issues.githubUrl,
      githubNumber: issues.githubNumber,
      githubState: issues.githubState,
      linkedExisting: issues.linkedExisting,
      createdAt: issues.createdAt,
      updatedAt: issues.updatedAt,
    })
    .from(issues)
    .where(and(...conditions))
    .orderBy(desc(issues.createdAt))
    .limit(200);

  // Counts for the summary strip reflect the *whole app*, not the current
  // filter — so switching filters doesn't make the totals jump around.
  const allRows = await db
    .select({ status: issues.status, githubState: issues.githubState })
    .from(issues)
    .where(eq(issues.projectId, appId));
  const totalCount = allRows.length;
  const draftCount = allRows.filter((r) => r.status === "draft").length;
  const openCount = allRows.filter((r) => r.githubState === "open").length;
  const closedCount = allRows.filter((r) => r.githubState === "closed").length;

  const relatedCounts = await getRelatedCounts(appId);
  const publishedIssueIds = rows
    .filter((r) => r.status === "published" && r.githubNumber != null)
    .map((r) => r.id);

  const appName = access.project?.name ?? appId;
  const repo = access.project?.githubRepo;
  const filtered = statusFilter !== "all" || ghFilter !== "all" || caseFilter != null || q != null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/apps" className="text-sm text-muted-foreground hover:underline">
          &larr; Apps
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Issues · {appName}</h1>
        <p className="text-muted-foreground">
          Issues generated from failed results — every one Testora has ever filed or drafted for this app, not just what's currently open.{" "}
          {repo ? (
            <span className="inline-flex items-center gap-1">
              <Github className="h-3.5 w-3.5" /> {repo}
            </span>
          ) : (
            "No GitHub repo connected — issues are kept as local markdown."
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryStat label="Total" value={totalCount} />
        <SummaryStat label="Open" value={openCount} tone="open" />
        <SummaryStat label="Closed" value={closedCount} tone="closed" />
        <SummaryStat label="Draft (not filed)" value={draftCount} tone="draft" />
      </div>

      <IssuesFilterBar caseOptions={caseOptions} publishedIssueIds={publishedIssueIds} />

      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            {totalCount === 0 ? (
              <>
                No issues yet. On the{" "}
                <Link href="/results" className="text-primary underline">
                  Results
                </Link>{" "}
                page, right-click a failed test and choose <strong>Generate issue</strong>.
              </>
            ) : (
              "No issues match these filters."
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered && (
            <p className="text-xs text-muted-foreground">
              {rows.length} of {totalCount} issue(s) match the current filters.
            </p>
          )}
          {rows.map((r) => {
            const relatedCount = r.caseId ? (relatedCounts.get(r.caseId) ?? 0) - 1 : 0;
            return (
              <Link key={r.id} href={`/apps/${appId}/issues/${r.id}`}>
                <Card className="transition-colors hover:border-primary/60">
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{r.title}</p>
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <LocalDateTime value={r.createdAt.toISOString()} />
                        {r.linkedExisting && <span>· linked to an existing report</span>}
                        {relatedCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-primary">
                            <Link2 className="h-3 w-3" />
                            {relatedCount} related
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {r.status === "published" && r.githubUrl && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <ExternalLink className="h-3.5 w-3.5" />
                          {r.githubNumber ? `#${r.githubNumber}` : "GitHub"}
                        </span>
                      )}
                      {r.status === "published" && <GithubStateBadge state={r.githubState} />}
                      <Badge variant={r.status === "published" ? "success" : "outline"}>{r.status}</Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "open" | "closed" | "draft";
}) {
  const toneClass =
    tone === "open"
      ? "text-green-600 dark:text-green-400"
      : tone === "closed"
        ? "text-purple-600 dark:text-purple-400"
        : tone === "draft"
          ? "text-muted-foreground"
          : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-semibold ${toneClass}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
