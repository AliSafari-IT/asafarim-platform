export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { issues } from "@/db/schema";
import { getProjectAccess } from "@/lib/app-access";
import { LockedApp } from "@/components/locked-app";
import { IssueEditor, type IssueData } from "@/components/issues/issue-editor";

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ appId: string; issueId: string }>;
}) {
  const { appId, issueId } = await params;
  const access = await getProjectAccess(appId);
  if (!access.exists) notFound();
  if (access.locked) {
    return <LockedApp projectId={appId} name={access.project?.name ?? appId} />;
  }

  const issue = await db.query.issues.findFirst({ where: eq(issues.id, issueId) });
  if (!issue || issue.projectId !== appId) notFound();

  const data: IssueData = {
    id: issue.id,
    projectId: issue.projectId,
    title: issue.title,
    body: issue.body,
    status: issue.status,
    githubUrl: issue.githubUrl,
    githubNumber: issue.githubNumber,
    githubState: issue.githubState,
    createdAt: issue.createdAt.toISOString(),
    updatedAt: issue.updatedAt.toISOString(),
  };

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/apps/${appId}/issues`} className="text-sm text-muted-foreground hover:underline">
        &larr; Issues · {access.project?.name ?? appId}
      </Link>
      <IssueEditor issue={data} githubConfigured={Boolean(access.project?.githubConfigured)} />
    </div>
  );
}
