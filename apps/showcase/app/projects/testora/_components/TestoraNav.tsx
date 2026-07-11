import Link from "next/link";
import styles from "./testora.module.css";

const LINKS = [
  { href: "/projects/testora", label: "Overview" },
  { href: "/projects/testora/run", label: "Latest run" },
  { href: "/projects/testora/trend", label: "Trend" },
  { href: "/projects/testora/case-study", label: "Case study" },
];

/** Sub-navigation across the Testora benchmark section. */
export function TestoraNav({ active }: { active: string }) {
  return (
    <nav className={styles.subnav} aria-label="Testora sections">
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
