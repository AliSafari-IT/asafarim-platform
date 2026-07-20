"use client";

import Link from "next/link";
import { useTranslation } from "@asafarim/shared-i18n";
import styles from "./ai-eval.module.css";

const LINKS = [
  { href: "/projects/ai-eval", labelKey: "showcase.nav.overview" },
  { href: "/projects/ai-eval/leaderboard", labelKey: "showcase.nav.leaderboard" },
  { href: "/projects/ai-eval/run", labelKey: "showcase.nav.results" },
  { href: "/projects/ai-eval/regression", labelKey: "showcase.nav.regression" },
  { href: "/projects/ai-eval/case-study", labelKey: "showcase.nav.caseStudy" },
];

/** Sub-navigation across the AI Evaluation Lab section. */
export function AiEvalNav({ active }: { active: string }) {
  const { t } = useTranslation();
  return (
    <nav className={styles.subnav} aria-label="AI Evaluation Lab sections">
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
