"use client";

import Link from "next/link";
import { useTranslation } from "@asafarim/shared-i18n";
import { HelpCircle } from "lucide-react";

type Props = {
  /** e.g. "/help/students/ask-a-question#step-2" — an article, optionally with an anchor. */
  href: string;
  /**
   * Override the default "How this works" label — use this to link
   * straight to what the label promises, e.g. a specific translated
   * "How matching works" string, rather than a generic link text.
   */
  labelKey?: string;
  className?: string;
};

/**
 * Small inline link dropped onto a complex screen, pointing at the most
 * relevant Help article (or article anchor) — never bare `/help`, so it
 * always lands the reader on the answer, not a search.
 */
export function ContextualHelpLink({ href, labelKey, className }: Props) {
  const { t } = useTranslation();
  return (
    <Link
      href={href}
      className={
        className ??
        "inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-muted)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
      }
    >
      <HelpCircle size={15} aria-hidden="true" />
      {t(labelKey ?? "edumatch.help.contextualLabel")}
    </Link>
  );
}
