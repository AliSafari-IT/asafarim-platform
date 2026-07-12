import Link from "next/link";
import styles from "./vionto.module.css";

const LINKS = [
  { href: "/projects/vionto", label: "Overview" },
  { href: "/projects/vionto/pipeline", label: "Pipeline explorer" },
  { href: "/projects/vionto/manifests", label: "Manifests" },
  { href: "/projects/vionto/cost", label: "Cost" },
  { href: "/projects/vionto/case-study", label: "Case study" },
];

/** Sub-navigation across the Vionto Studio benchmark section. */
export function ViontoNav({ active }: { active: string }) {
  return (
    <nav className={styles.subnav} aria-label="Vionto Studio sections">
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
