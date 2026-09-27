import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolShell } from "../../../components/tools/ToolShell";
import { getRoutableTools, getTool } from "../../../lib/tools/catalogue";
import { buildToolMetadata } from "../../../lib/tools/metadata";
import { toolWorkbenches } from "./workbenches";

type Props = { params: Promise<{ slug: string }> };

// Only catalogue slugs render; anything else is a 404 rather than a lookup.
export const dynamicParams = false;

export function generateStaticParams() {
  return getRoutableTools().map((tool) => ({ slug: tool.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tool = getTool((await params).slug);
  return tool ? buildToolMetadata(tool) : {};
}

export default async function ToolPage({ params }: Props) {
  const tool = getTool((await params).slug);
  if (!tool) notFound();
  const Workbench = toolWorkbenches[tool.slug];

  return (
    <ToolShell tool={tool}>
      <Workbench tool={tool} />
    </ToolShell>
  );
}
