import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** Monospace glyph above the title, e.g. "[ ]" or "//". */
  glyph?: string;
  /** Optional call to action (button or link). */
  action?: ReactNode;
}

export function EmptyState({
  title,
  description,
  glyph = "[ · ]",
  action,
}: EmptyStateProps) {
  return (
    <div className="ui-empty">
      <div className="ui-empty__glyph" aria-hidden="true">
        {glyph}
      </div>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}
