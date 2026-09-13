import { requireMembership } from "../../../lib/workspace-access";
import { getTasksAiDb } from "../../../lib/db/client";
import { isAtLeast } from "../../../lib/authz";
import { workspaceHomeData } from "../../../lib/home/service";
import type { RequestContext } from "../../../lib/context";
import { WorkspaceHome } from "../../../components/home/WorkspaceHome";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home" };

/**
 * The workspace home (issue #365). This used to redirect straight to My
 * Work, which meant a brand-new workspace opened on an empty list and
 * explained nothing. Now it orients: onboarding while the workspace is
 * empty, a compact summary once it is not.
 */
export default async function WorkspaceHomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const m = await requireMembership(slug);
  const ctx: RequestContext = {
    db: getTasksAiDb(),
    workspaceId: m.workspaceId,
    workspaceSlug: slug,
    actor: { membershipId: m.membershipId, platformUserId: m.platformUserId, role: m.role },
    correlationId: "page",
  };

  const data = await workspaceHomeData(ctx);

  return (
    <WorkspaceHome
      slug={slug}
      workspaceName={m.workspaceName}
      canCreateProject={isAtLeast(m.role, "member")}
      data={data}
    />
  );
}
