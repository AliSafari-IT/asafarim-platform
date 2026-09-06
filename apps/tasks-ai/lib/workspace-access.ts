import "server-only";
import { redirect } from "next/navigation";
import { getPlatformLinks } from "@asafarim/ui";
import { getTasksAiDb } from "./db/client";
import { getViewer } from "./session";
import type { MemberRole } from "./db/generated";

export interface ResolvedMembership {
  workspaceId: string;
  workspaceName: string;
  slug: string;
  membershipId: string;
  role: MemberRole;
  platformUserId: string;
}

/** Server-component guard: the current viewer's membership in `slug`, or a redirect. */
export async function requireMembership(slug: string): Promise<ResolvedMembership> {
  const viewer = await getViewer();
  if (!viewer) {
    const links = getPlatformLinks();
    redirect(`${links.hub}/sign-in?callbackUrl=${encodeURIComponent(`${links.tasksai}/w/${slug}`)}`);
  }
  const db = getTasksAiDb();
  const workspace = await db.workspace.findFirst({
    where: { slug, archivedAt: null },
    select: { id: true, name: true, slug: true },
  });
  if (!workspace) redirect("/workspace");

  const membership = await db.membership.findUnique({
    where: { workspaceId_platformUserId: { workspaceId: workspace.id, platformUserId: viewer.id } },
    select: { id: true, role: true, archivedAt: true },
  });
  if (!membership || membership.archivedAt) redirect("/workspace");

  return {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    slug: workspace.slug,
    membershipId: membership.id,
    role: membership.role,
    platformUserId: viewer.id,
  };
}
