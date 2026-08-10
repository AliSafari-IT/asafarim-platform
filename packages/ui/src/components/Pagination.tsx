import type { ReactNode } from "react";

export interface PaginationProps {
  page: number;
  pageSize: number;
  /** Total rows matching the current filters, not the page length. */
  total: number;
  /** Builds the href for a given page number. */
  hrefFor: (page: number) => string;
  /** Singular noun for the count line, e.g. "user". Pluralized with "s". */
  noun?: string;
  /** Rendered on the left of the bar — typically a CSV export link. */
  actions?: ReactNode;
}

/** Count line plus prev/next links. Pure links: no client JS, deep-linkable. */
export function Pagination({
  page,
  pageSize,
  total,
  hrefFor,
  noun = "row",
  actions,
}: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const hasPrev = page > 1;
  const hasNext = page * pageSize < total;

  return (
    <div className="ui-pagination">
      <span className="u-mono">
        {total} {noun}
        {total === 1 ? "" : "s"} · page {page} of {pages}
        {actions ? <span className="ui-pagination__actions">{actions}</span> : null}
      </span>
      <span className="ui-chips">
        {hasPrev ? (
          <a href={hrefFor(page - 1)} className="ui-btn ui-btn--console ui-btn--sm">
            ← prev
          </a>
        ) : null}
        {hasNext ? (
          <a href={hrefFor(page + 1)} className="ui-btn ui-btn--console ui-btn--sm">
            next →
          </a>
        ) : null}
      </span>
    </div>
  );
}
