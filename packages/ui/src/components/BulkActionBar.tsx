import type { ReactNode } from "react";
import { SelectionCount } from "./SelectionCount";

export interface BulkActionBarProps {
  /** The checkbox `name` used by the table's selection column. */
  name: string;
  /** Buttons, each typically carrying its own `formAction`. */
  children: ReactNode;
  noun?: string;
  hint?: string;
}

/**
 * Actions applied to the rows checked in a DataTable.
 *
 * Lives inside the page's <form>, so submission carries the checked ids to
 * a server action with no client state: the browser's own form semantics do
 * the work, and each button picks its handler via `formAction`.
 */
export function BulkActionBar({ name, children, noun = "row", hint }: BulkActionBarProps) {
  return (
    <div className="ui-bulkbar">
      <SelectionCount name={name} noun={noun} />
      <span className="ui-bulkbar__actions">{children}</span>
      {hint ? <span className="ui-bulkbar__hint u-muted">{hint}</span> : null}
    </div>
  );
}
