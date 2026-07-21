export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { Github, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db/client";
import { issues } from "@/db/schema";
import { getProjectAccess } from "@/lib/app-access";
import { LockedApp } from "@/components/locked-app";
import { GithubStateBadge } from "@/components/issues/github-state-badge";

export default async function AppIssuesPage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params;
  const access = await getProjectAccess(appId);
  if (!access.exists) notFound();
  if (access.locked) {
    return <LockedApp projectId={appId} name={access.project?.name ?? appId} />;
  }

  const rows = await db
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
    .where(eq(issues.projectId, appId))
    .orderBy(desc(issues.createdAt));

  const appName = access.project?.name ?? appId;
  const repo = access.project?.githubRepo;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/apps" className="text-sm text-muted-foreground hover:underline">
          &larr; Apps
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Issues · {appName}</h1>
        <p className="text-muted-foreground">
          Issues generated from failed results.{" "}
          {repo ? (
            <span className="inline-flex items-center gap-1">
              <Github className="h-3.5 w-3.5" /> {repo}
            </span>
          ) : (
            "No GitHub repo connected — issues are kept as local markdown."
          )}
        </p>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No issues yet. On the <Link href="/results" className="text-primary underline">Results</Link>{" "}
            page, right-click a failed test and choose <strong>Generate issue</strong>.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <Link key={r.id} href={`/apps/${appId}/issues/${r.id}`}>
              <Card className="transition-colors hover:border-primary/60">
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{r.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleString()}
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
                    <Badge variant={r.status === "published" ? "success" : "outline"}>
                      {r.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
