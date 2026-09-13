import { requireMembership } from "../../../../lib/workspace-access";
import { InboxTriage } from "../../../../components/tasks/InboxTriage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inbox" };

/**
 * The triage Inbox (issue #366): captured work that still needs organizing.
 * Deliberately *not* the generic task workspace any more — Inbox and My Work
 * answer different questions, and sharing a component made them the same
 * list with different filters.
 */
export default async function InboxPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await requireMembership(slug);
  return <InboxTriage slug={slug} me={m.membershipId} role={m.role} />;
}
