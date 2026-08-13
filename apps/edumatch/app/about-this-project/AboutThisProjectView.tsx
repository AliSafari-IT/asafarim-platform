"use client";

import Link from "next/link";
import { Github, Mail } from "lucide-react";
import { useTranslation, toBaseLanguage } from "@asafarim/shared-i18n";
import { getShowcaseProject } from "@asafarim/auth/apps";
import { ShowcaseAbout } from "@asafarim/ui";

const webUrl = process.env.NEXT_PUBLIC_WEB_URL || "https://asafarim.com";

export function AboutThisProjectView() {
  const { t, locale } = useTranslation();
  const showcase = getShowcaseProject("edumatch", toBaseLanguage(locale))!;

  return (
    <ShowcaseAbout
      appName="EduMatch"
      content={showcase}
      contactHref={`${webUrl}/contact`}
      labels={{
        sectionWhatWorks: t("edumatch.showcase.whatWorks"),
        sectionSyntheticData: t("edumatch.showcase.syntheticData"),
        sectionDemonstrates: t("edumatch.showcase.demonstrates", { appName: "EduMatch" }),
        sectionWhereThisStands: t("edumatch.showcase.whereThisStands"),
        ctaHeading: t("edumatch.showcase.ctaHeading"),
        ctaBody: t("edumatch.showcase.ctaBody", { appName: "EduMatch" }),
        ctaLinkText: t("edumatch.showcase.ctaLinkText"),
      }}
    >
      <section className="ui-showcase-about__section">
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a href={`${webUrl}/contact`} className="edu-button edu-button-primary">
            <Mail size={16} /> {t("edumatch.about.sendMessage")}
          </a>
          <a href={webUrl} className="edu-button edu-button-secondary">
            {t("edumatch.about.visitSite")}
          </a>
          <a
            href="https://github.com/AliSafari-IT"
            target="_blank"
            rel="noreferrer"
            className="edu-button edu-button-secondary"
          >
            <Github size={16} /> {t("edumatch.about.browseCode")}
          </a>
        </div>
        <p className="mt-6 text-xs text-[var(--color-text-subtle)]">
          <Link href="/" className="underline underline-offset-4">
            {t("edumatch.about.backToEduMatch")}
          </Link>
        </p>
      </section>
    </ShowcaseAbout>
  );
}
