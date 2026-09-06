import type { ReactNode } from "react";
import { requireMembership } from "../../../lib/workspace-access";
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
  return (
    <WorkspaceShell
      slug={m.slug}
      workspaceName={m.workspaceName}
      role={m.role}
      membershipId={m.membershipId}
    >
      {children}
    </WorkspaceShell>
  );
}
