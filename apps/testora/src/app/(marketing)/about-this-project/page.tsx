import type { Metadata } from "next";
import { getShowcaseProject } from "@asafarim/auth/apps";
import { ShowcaseAbout } from "@asafarim/ui";

const showcase = getShowcaseProject("testora")!;
const webUrl = process.env.NEXT_PUBLIC_WEB_URL || "https://asafarim.com";

export const metadata: Metadata = {
  title: "Behind this project",
  description:
    "Testora is a working test-automation application published as a showcase by ASafarIM Digital: what runs live, what is committed benchmark evidence, and where it stands commercially.",
};

export default function AboutThisProjectPage() {
  return (
    <ShowcaseAbout
      appName="Testora"
      content={showcase}
      contactHref={`${webUrl}/contact`}
    />
  );
}
