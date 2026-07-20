"use client";

import Link from "next/link";
import { useTranslation } from "@asafarim/shared-i18n";
import styles from "./edumatch.module.css";

const LINKS = [
  { href: "/projects/edumatch", labelKey: "showcase.nav.overview" },
  { href: "/projects/edumatch/explorer", labelKey: "showcase.nav.matchExplorer" },
  { href: "/projects/edumatch/journey", labelKey: "showcase.nav.journey" },
  { href: "/projects/edumatch/fairness", labelKey: "showcase.nav.fairness" },
  { href: "/projects/edumatch/case-study", labelKey: "showcase.nav.caseStudy" },
];

/** Sub-navigation across the EduMatch benchmark section. */
export function EdumatchNav({ active }: { active: string }) {
  const { t } = useTranslation();
  return (
    <nav className={styles.subnav} aria-label="EduMatch sections">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={styles.subnavLink}
          aria-current={l.href === active ? "page" : undefined}
        >
          {t(l.labelKey)}
        </Link>
      ))}
    </nav>
  );
}
