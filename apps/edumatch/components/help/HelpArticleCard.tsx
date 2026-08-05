import Link from "next/link";
import { ArrowRight } from "lucide-react";

type Props = {
  href: string;
  title: string;
  summary: string;
  audienceLabel: string;
};

/** A single article preview card, used on the hub, audience index, and search results. */
export function HelpArticleCard({ href, title, summary, audienceLabel }: Props) {
  return (
    <Link
      href={href}
      className="flex min-h-[44px] flex-col gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4 transition hover:border-[var(--color-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
    >
      <span className="w-fit rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-subtle)]">
        {audienceLabel}
      </span>
      <span className="font-semibold text-[var(--color-text)]">{title}</span>
      <span className="text-sm text-[var(--color-text-muted)]">{summary}</span>
      <span className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-[var(--color-primary)]">
        <ArrowRight size={14} aria-hidden="true" />
      </span>
    </Link>
  );
}
