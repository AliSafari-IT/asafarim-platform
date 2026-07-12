import Link from "next/link";
import styles from "./edumatch.module.css";

const LINKS = [
  { href: "/projects/edumatch", label: "Overview" },
  { href: "/projects/edumatch/explorer", label: "Match explorer" },
  { href: "/projects/edumatch/journey", label: "Journey" },
  { href: "/projects/edumatch/fairness", label: "Fairness" },
  { href: "/projects/edumatch/case-study", label: "Case study" },
];

/** Sub-navigation across the EduMatch benchmark section. */
export function EdumatchNav({ active }: { active: string }) {
  return (
    <nav className={styles.subnav} aria-label="EduMatch sections">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={styles.subnavLink}
          aria-current={l.href === active ? "page" : undefined}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
