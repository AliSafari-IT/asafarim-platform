import Link from "next/link";
import styles from "./ai-eval.module.css";

const LINKS = [
  { href: "/projects/ai-eval", label: "Overview" },
  { href: "/projects/ai-eval/leaderboard", label: "Leaderboard" },
  { href: "/projects/ai-eval/run", label: "Results" },
  { href: "/projects/ai-eval/regression", label: "Regression" },
  { href: "/projects/ai-eval/case-study", label: "Case study" },
];

/** Sub-navigation across the AI Evaluation Lab section. */
export function AiEvalNav({ active }: { active: string }) {
  return (
    <nav className={styles.subnav} aria-label="AI Evaluation Lab sections">
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
