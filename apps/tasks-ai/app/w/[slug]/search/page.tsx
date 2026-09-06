import { requireMembership } from "../../../../lib/workspace-access";
import { SearchPanel } from "../../../../components/SearchPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Search" };

export default async function SearchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireMembership(slug);
  return <SearchPanel slug={slug} />;
}
