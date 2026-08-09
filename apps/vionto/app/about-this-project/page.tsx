import type { Metadata } from "next";
import { getShowcaseProject } from "@asafarim/auth/apps";
import { ShowcaseAbout } from "@asafarim/ui";

const showcase = getShowcaseProject("vionto")!;
const webUrl = process.env.NEXT_PUBLIC_WEB_URL || "https://asafarim.com";

export const metadata: Metadata = {
  title: "Behind this project",
  description:
    "Vionto is a beta showcase product from ASafarIM Digital: what works, what is fixture-backed, what it proves technically, and where it stands commercially.",
};

export default function AboutThisProjectPage() {
  return (
    <ShowcaseAbout
      appName="Vionto"
      content={showcase}
      contactHref={`${webUrl}/contact`}
    />
  );
}
