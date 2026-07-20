"use client";

import Link from "next/link";
import { useTranslation } from "@asafarim/shared-i18n";
import styles from "./testora.module.css";

const LINKS = [
  { href: "/projects/testora", labelKey: "showcase.nav.overview" },
  { href: "/projects/testora/run", labelKey: "showcase.nav.latestRun" },
  { href: "/projects/testora/trend", labelKey: "showcase.nav.trend" },
  { href: "/projects/testora/case-study", labelKey: "showcase.nav.caseStudy" },
];

/** Sub-navigation across the Testora benchmark section. */
export function TestoraNav({ active }: { active: string }) {
  const { t } = useTranslation();
  return (
    <nav className={styles.subnav} aria-label="Testora sections">
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
