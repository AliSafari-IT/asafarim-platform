import { requireMembership } from "../../../../lib/workspace-access";
import { isAtLeast } from "../../../../lib/authz";
import { AutomationsPanel } from "../../../../components/AutomationsPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Automations" };

export default async function AutomationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await requireMembership(slug);
  return <AutomationsPanel slug={slug} canManage={isAtLeast(m.role, "admin")} />;
}
