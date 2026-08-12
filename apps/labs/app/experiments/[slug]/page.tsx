import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getExperiment, getExperimentSlugs } from "../../../lib/experiments/registry";
import { ExperimentShell } from "../_ExperimentShell";
import { TimelineLayoutLab } from "../timeline-layout/TimelineLayoutLab";
import { UiPlayground } from "../ui-playground/UiPlayground";
import { AiEvalExplorer } from "../ai-eval-explorer/AiEvalExplorer";

const COMPONENTS: Record<string, () => React.ReactElement> = {
  TimelineLayoutLab,
  UiPlayground,
  AiEvalExplorer,
};

export function generateStaticParams() {
  return getExperimentSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const experiment = getExperiment(slug);
  return { title: experiment?.title ?? "Experiment" };
}

export default async function ExperimentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const experiment = getExperiment(slug);
  if (!experiment) notFound();

  const Canvas = COMPONENTS[experiment.component];
  if (!Canvas) notFound();

  return <ExperimentShell experiment={experiment} canvas={<Canvas />} />;
}
