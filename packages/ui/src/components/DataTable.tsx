import type { ReactNode } from "react";
import { SelectAllCheckbox } from "./SelectAllCheckbox";

/**
 * One column of a console table.
 *
 * `render` is a plain function, which is why DataTable is deliberately a
 * server component: a client component could not receive it across the
 * RSC boundary, and every admin page here fetches on the server.
 */
export interface ColumnDef<T> {
  /** Stable identifier, also used as the React key for cells. */
  id: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  /** Renders the cell in the mono face — ids, dates, counts. */
  mono?: boolean;
  align?: "left" | "right";
  /** Suppress wrapping for short technical values. */
  nowrap?: boolean;
}

export interface DataTableSelection {
  /**
   * Checkbox field name. Bulk-action server actions read this with
   * `formData.getAll(name)`.
   */
  name: string;
  /** id of the <form> the checkboxes belong to, when it wraps the table. */
  form?: string;
  /** Rows that cannot participate — e.g. system roles. */
  isDisabled?: (rowKey: string) => boolean;
  label?: string;
}

export interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  /** Adds a leading checkbox column plus a select-all toggle in the header. */
  selection?: DataTableSelection;
  /** Rendered in place of the table body when there are no rows. */
  empty?: ReactNode;
  /** Applies `white-space: nowrap` to every cell. */
  nowrap?: boolean;
  caption?: string;
}

/**
 * The console's one table. Pages describe columns and hand over rows; they
 * no longer hand-roll <thead>/<tbody>, which is how users and audit-logs
 * drifted into different hover, link, and empty-state behaviour.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  selection,
  empty,
  nowrap,
  caption,
}: DataTableProps<T>) {
  if (rows.length === 0 && empty) return <>{empty}</>;

  const selectableKeys = selection
    ? rows
        .map(getRowKey)
        .filter((key) => !selection.isDisabled?.(key))
    : [];

  return (
    <div className="ui-tablewrap">
      <table className={`ui-table${nowrap ? " ui-table--nowrap" : ""}`}>
        {caption ? <caption className="u-visually-hidden">{caption}</caption> : null}
        <thead>
          <tr>
            {selection ? (
              <th className="ui-table__check">
                <SelectAllCheckbox
                  name={selection.name}
                  label={selection.label ?? "Select all rows"}
                  disabled={selectableKeys.length === 0}
                />
              </th>
            ) : null}
            {columns.map((column) => (
              <th
                key={column.id}
                style={column.align === "right" ? { textAlign: "right" } : undefined}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = getRowKey(row);
            const disabled = selection?.isDisabled?.(key) ?? false;
            return (
              <tr key={key}>
                {selection ? (
                  <td className="ui-table__check">
                    <input
                      type="checkbox"
                      name={selection.name}
                      value={key}
                      form={selection.form}
                      disabled={disabled}
                      aria-label={`Select ${key}`}
                    />
                  </td>
                ) : null}
                {columns.map((column) => (
                  <td
                    key={column.id}
                    className={[
                      column.mono ? "u-mono" : "",
                      column.nowrap ? "u-nowrap" : "",
                    ]
                      .filter(Boolean)
                      .join(" ") || undefined}
                    style={column.align === "right" ? { textAlign: "right" } : undefined}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
