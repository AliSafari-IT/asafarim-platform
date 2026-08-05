import { HelpVisual } from "./HelpVisual";
import type { HelpVisualKind } from "@/lib/help-content";

type Props = {
  index: number;
  total: number;
  title: string;
  body: string;
  visual: HelpVisualKind;
  stepLabel: string;
};

/** One numbered step in a Help article's walkthrough: visual + title + body. */
export function HelpStep({ index, total, title, body, visual, stepLabel }: Props) {
  return (
    <li className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,180px)] sm:items-center">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-subtle)]">
          {stepLabel} {index} / {total}
        </p>
        <h3 className="mt-1 text-base font-semibold text-[var(--color-text)]">
          {title}
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-[var(--color-text-muted)]">
          {body}
        </p>
      </div>
      <HelpVisual kind={visual} />
    </li>
  );
}
