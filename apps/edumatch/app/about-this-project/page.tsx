import type { Metadata } from "next";
import Link from "next/link";
import { Github, Mail } from "lucide-react";
import { getShowcaseProject } from "@asafarim/auth/apps";
import { ShowcaseAbout } from "@asafarim/ui";

const showcase = getShowcaseProject("edumatch")!;
const webUrl = process.env.NEXT_PUBLIC_WEB_URL || "https://asafarim.com";

export const metadata: Metadata = {
  title: "Behind this project",
  description:
    "EduMatch is a working showcase project from ASafarIM Digital: a complete tutoring-marketplace architecture, deployed on production infrastructure, with no commercial marketplace behind it.",
};

export default function AboutThisProjectPage() {
  return (
    <ShowcaseAbout
      appName="EduMatch"
      content={showcase}
      contactHref={`${webUrl}/contact`}
    >
      <section className="ui-showcase-about__section">
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a href={`${webUrl}/contact`} className="edu-button edu-button-primary">
            <Mail size={16} /> Send a message
          </a>
          <a href={webUrl} className="edu-button edu-button-secondary">
            Visit asafarim.com
          </a>
          <a
            href="https://github.com/AliSafari-IT"
            target="_blank"
            rel="noreferrer"
            className="edu-button edu-button-secondary"
          >
            <Github size={16} /> Browse the code
          </a>
        </div>
        <p className="mt-6 text-xs text-[var(--color-text-subtle)]">
          <Link href="/" className="underline underline-offset-4">
            ← Back to EduMatch
          </Link>
        </p>
      </section>
    </ShowcaseAbout>
  );
}
