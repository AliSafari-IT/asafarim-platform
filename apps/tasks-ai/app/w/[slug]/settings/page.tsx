import { requireMembership } from "../../../../lib/workspace-access";
import { isAtLeast } from "../../../../lib/authz";
import { SettingsTabs } from "../../../../components/settings/SettingsTabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await requireMembership(slug);
  return <SettingsTabs slug={slug} isAdmin={isAtLeast(m.role, "admin")} />;
}
