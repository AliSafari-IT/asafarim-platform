import type { Metadata } from "next";
import { getShowcaseProject } from "@asafarim/auth/apps";
import { ShowcaseAbout } from "@asafarim/ui";
import { count } from "drizzle-orm";
import { db } from "@/db/client";
import { functionalRequirements, testSuites, testFixtures, testCases } from "@/db/schema";
import { PipelineVisual } from "./PipelineVisual";

const showcase = getShowcaseProject("testora")!;
const webUrl = process.env.NEXT_PUBLIC_WEB_URL || "https://asafarim.com";

// The stat strip reads live counts from the database — never cache/prerender
// this page with a stale snapshot baked in.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Behind this project",
  description:
    "Testora is a working test-automation application published as a showcase by ASafarIM Digital: what runs live, what is committed benchmark evidence, and where it stands commercially.",
};

export default async function AboutThisProjectPage() {
  const [[frCount], [suiteCount], [fixtureCount], [caseCount]] = await Promise.all([
    db.select({ n: count() }).from(functionalRequirements),
    db.select({ n: count() }).from(testSuites),
    db.select({ n: count() }).from(testFixtures),
    db.select({ n: count() }).from(testCases),
  ]);

  const stats = [
    { label: "Requirements tracked", value: frCount?.n ?? 0 },
    { label: "Test suites", value: suiteCount?.n ?? 0 },
    { label: "Fixtures", value: fixtureCount?.n ?? 0 },
    { label: "Test cases", value: caseCount?.n ?? 0 },
  ];

  return (
    <ShowcaseAbout
      appName="Testora"
      content={showcase}
      contactHref={`${webUrl}/contact`}
    >
      <PipelineVisual stats={stats} />
    </ShowcaseAbout>
  );
}
