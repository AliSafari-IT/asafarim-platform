"use client";

import Link from "next/link";
import { useTranslation } from "@asafarim/shared-i18n";
import styles from "./vionto.module.css";

const LINKS = [
  { href: "/projects/vionto", labelKey: "showcase.nav.overview" },
  { href: "/projects/vionto/pipeline", labelKey: "showcase.nav.pipeline" },
  { href: "/projects/vionto/manifests", labelKey: "showcase.nav.manifests" },
  { href: "/projects/vionto/cost", labelKey: "showcase.nav.cost" },
  { href: "/projects/vionto/case-study", labelKey: "showcase.nav.caseStudy" },
];

/** Sub-navigation across the Vionto Studio benchmark section. */
export function ViontoNav({ active }: { active: string }) {
  const { t } = useTranslation();
  return (
    <nav className={styles.subnav} aria-label="Vionto Studio sections">
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
