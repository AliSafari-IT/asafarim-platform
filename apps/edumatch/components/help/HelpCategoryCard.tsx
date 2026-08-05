import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

type Props = {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  /** Larger, emphasized variant for the two top-level "for students"/"for tutors" entry cards. */
  emphasized?: boolean;
};

/** A single Help Center category tile — role entry points, or topic tiles (safety, payments, ...). */
export function HelpCategoryCard({ href, icon: Icon, title, description, emphasized }: Props) {
  return (
    <Link
      href={href}
      className={`group flex min-h-[44px] flex-col gap-2 rounded-xl border p-5 transition hover:border-[var(--color-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)] ${
        emphasized
          ? "border-[var(--color-border-strong)] bg-[var(--color-panel-strong)]"
          : "border-[var(--color-border)] bg-[var(--color-panel)]"
      }`}
    >
      <span
        className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${
          emphasized
            ? "bg-[var(--color-primary)] text-white"
            : "bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
        }`}
      >
        <Icon size={20} aria-hidden="true" />
      </span>
      <span className={`font-semibold text-[var(--color-text)] ${emphasized ? "text-lg" : "text-base"}`}>
        {title}
      </span>
      <span className="text-sm text-[var(--color-text-muted)]">{description}</span>
      <span className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-[var(--color-primary)] opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
        <ArrowRight size={14} aria-hidden="true" />
      </span>
    </Link>
  );
}
