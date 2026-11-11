import type { ReactNode } from "react";

export interface ChipListProps {
  /** One element per chip (usually `<Badge>`s), each with its own key. */
  items: ReactNode[];
  /** How many chips show before the "+N" toggle (default 3). */
  max?: number;
  /** What the toggle announces, e.g. "apps". Used as "Show 9 more apps". */
  noun?: string;
  /** Shown when there is nothing (default an em dash). */
  empty?: ReactNode;
}

/**
 * A row of chips that stays one or two lines tall. The first `max` show; the rest sit
 * behind a "+N" toggle that opens them in place (a native <details>: works from the
 * keyboard, needs no script, and is not clipped by a scrolling table wrapper).
 */
export function ChipList({
  items,
  max = 3,
  noun = "items",
  empty = <span className="u-muted">—</span>,
}: ChipListProps) {
  if (items.length === 0) return <span className="ui-chips">{empty}</span>;
  const shown = items.slice(0, max);
  const rest = items.slice(max);
  return (
    <span className="ui-chips ui-chiplist">
      {shown}
      {rest.length > 0 ? (
        <details className="ui-chiplist__more">
          <summary
            aria-label={`Show ${rest.length} more ${noun}`}
            title={`Show ${rest.length} more ${noun}`}
          >
            +{rest.length}
          </summary>
          <span className="ui-chips ui-chiplist__rest">{rest}</span>
        </details>
      ) : null}
    </span>
  );
}
