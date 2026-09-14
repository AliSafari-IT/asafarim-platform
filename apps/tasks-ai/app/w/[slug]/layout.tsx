import type { ReactNode } from "react";
import { requireMembership } from "../../../lib/workspace-access";
import { getTasksAiDb } from "../../../lib/db/client";
import { getAiSettings } from "../../../lib/ai/settings";
import { WorkspaceShell } from "../../../components/WorkspaceShell";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const m = await requireMembership(slug);
  // Read once for the whole workspace shell (issue #368): contextual Copilot
  // entry points live on several surfaces, and each fetching its own copy of
  // the AI kill-switch would be both wasteful and liable to disagree.
  const settings = await getAiSettings({
    db: getTasksAiDb(),
    workspaceId: m.workspaceId,
    workspaceSlug: m.slug,
    actor: { membershipId: m.membershipId, platformUserId: m.platformUserId, role: m.role },
    correlationId: "layout",
  });
  return (
    <WorkspaceShell
      slug={m.slug}
      workspaceName={m.workspaceName}
      role={m.role}
      membershipId={m.membershipId}
      aiEnabled={settings.enabled}
    >
      {children}
    </WorkspaceShell>
  );
}
