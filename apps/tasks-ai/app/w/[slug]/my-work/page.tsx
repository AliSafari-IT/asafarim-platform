import { requireMembership } from "../../../../lib/workspace-access";
import { MyWork } from "../../../../components/tasks/MyWork";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Work" };

/**
 * My Work (issue #367): the user's cross-project execution surface. The data
 * comes from /api/v1/workspaces/{slug}/my-work rather than the generic task
 * list, because the view needs project identity, status, and dependency
 * state per row — and the workspace counts that let it explain an empty list.
 */
export default async function MyWorkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await requireMembership(slug);
  return <MyWork slug={slug} me={m.membershipId} role={m.role} />;
}
