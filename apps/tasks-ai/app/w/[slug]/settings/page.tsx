import { requireMembership } from "../../../../lib/workspace-access";
import { isAtLeast } from "../../../../lib/authz";
import { SettingsTabs } from "../../../../components/settings/SettingsTabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug } = await params;
  const { tab } = await searchParams;
  const m = await requireMembership(slug);
  return <SettingsTabs slug={slug} isAdmin={isAtLeast(m.role, "admin")} initialTab={tab} />;
}
