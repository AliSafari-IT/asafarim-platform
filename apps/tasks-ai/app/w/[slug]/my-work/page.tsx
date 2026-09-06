import { requireMembership } from "../../../../lib/workspace-access";
import { TaskWorkspace } from "../../../../components/tasks/TaskWorkspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Work" };

export default async function MyWorkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await requireMembership(slug);
  return <TaskWorkspace slug={slug} me={m.membershipId} fixedView="my_work" heading="My Work" />;
}
