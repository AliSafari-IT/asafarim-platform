import type { Metadata } from "next";
import Link from "next/link";
import { getShowcaseProject } from "@asafarim/auth/apps";
import { ShowcaseAbout } from "@asafarim/ui";

const showcase = getShowcaseProject("timelineai")!;
const webUrl = process.env.NEXT_PUBLIC_WEB_URL || "https://asafarim.com";

export const metadata: Metadata = {
  title: "Behind this project",
  description:
    "TimelineAI is a working showcase product from ASafarIM Digital: what works, what is demonstration data, what it proves technically, and where it stands commercially.",
};

export default function AboutThisProjectPage() {
  return (
    <ShowcaseAbout
      appName="TimelineAI"
      content={showcase}
      contactHref={`${webUrl}/contact`}
    >
      <p className="ui-showcase-about__section">
        <Link href="/create">Create a timeline</Link> to see all of this for
        yourself — no account required.
      </p>
    </ShowcaseAbout>
  );
}
