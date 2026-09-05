import { requireMembership } from "../../../../lib/workspace-access";
import { TaskWorkspace } from "../../../../components/tasks/TaskWorkspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inbox" };

export default async function InboxPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await requireMembership(slug);
  return <TaskWorkspace slug={slug} me={m.membershipId} fixedView="inbox" heading="Inbox" />;
}
