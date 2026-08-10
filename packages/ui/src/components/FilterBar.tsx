import type { ReactNode } from "react";
import { Button } from "./Button";
import { Input, Select, type SelectOption } from "./Form";

export type FilterField =
  | {
      kind: "search";
      name: string;
      label: string;
      value: string;
      placeholder?: string;
      /** Flex basis hint in rem. */
      width?: number;
    }
  | {
      kind: "text";
      name: string;
      label: string;
      value: string;
      placeholder?: string;
      width?: number;
    }
  | {
      kind: "select";
      name: string;
      label: string;
      value: string;
      options: SelectOption[];
      width?: number;
    }
  | {
      kind: "date";
      name: string;
      label: string;
      value: string;
      width?: number;
    };

export interface FilterBarProps {
  /** Target path, e.g. "/users". Submits as GET so filters stay in the URL. */
  action: string;
  fields: FilterField[];
  /**
   * Segmented links rendered beside the inputs — for filters that read
   * better as one-click chips than as a select (status, scope).
   */
  chips?: {
    label: string;
    options: { label: string; href: string; active: boolean }[];
  };
  /** Extra controls (export, create) pinned to the right. */
  actions?: ReactNode;
  submitLabel?: string;
  /** Shown when any filter is set; links back to the unfiltered view. */
  clearHref?: string;
  hasFilters?: boolean;
}

/**
 * The console's filter row: a plain GET form, so every filtered view is a
 * shareable URL and works with no client JS. Pages declare fields instead
 * of hand-laying-out inputs, which is what kept users/ and audit-logs/
 * looking like two different products.
 */
export function FilterBar({
  action,
  fields,
  chips,
  actions,
  submitLabel = "filter",
  clearHref,
  hasFilters,
}: FilterBarProps) {
  return (
    <form method="GET" action={action} className="ui-filterbar">
      {fields.map((field) => {
        const id = `filter-${field.name}`;
        const flex = field.width ? `1 1 ${field.width}rem` : undefined;
        const maxWidth = field.width ? `${field.width * 1.6}rem` : undefined;
        return (
          <div key={field.name} className="ui-filterbar__field" style={{ flex, maxWidth }}>
            <label className="ui-filterbar__label u-mono" htmlFor={id}>
              {field.label}
            </label>
            {field.kind === "select" ? (
              <Select id={id} name={field.name} defaultValue={field.value} options={field.options} />
            ) : (
              <Input
                id={id}
                name={field.name}
                type={field.kind === "search" ? "search" : field.kind === "date" ? "date" : "text"}
                defaultValue={field.value}
                placeholder={field.kind === "date" ? undefined : field.placeholder}
              />
            )}
          </div>
        );
      })}

      <div className="ui-filterbar__actions">
        <Button type="submit" variant="console" size="sm">
          {submitLabel}
        </Button>
        {hasFilters && clearHref ? (
          <a href={clearHref} className="ui-btn ui-btn--ghost ui-btn--sm">
            clear
          </a>
        ) : null}
      </div>

      {chips ? (
        <div className="ui-filterbar__chips">
          <span className="ui-filterbar__label u-mono">{chips.label}</span>
          <span className="ui-chips">
            {chips.options.map((option) => (
              <a
                key={option.href}
                href={option.href}
                className={`ui-btn ui-btn--sm ${
                  option.active ? "ui-btn--console" : "ui-btn--ghost"
                }`}
              >
                {option.label}
              </a>
            ))}
          </span>
        </div>
      ) : null}

      {actions ? <div className="ui-filterbar__trailing">{actions}</div> : null}
    </form>
  );
}
