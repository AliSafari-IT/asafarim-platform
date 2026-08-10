"use client";

import { useRef } from "react";

export interface SelectAllCheckboxProps {
  /** The `name` shared by the row checkboxes this toggle controls. */
  name: string;
  label: string;
  disabled?: boolean;
}

/**
 * The one interactive island in DataTable.
 *
 * It receives only strings, so a server-rendered table can still use it.
 * It walks the enclosing <table> rather than holding row state, which keeps
 * the table itself a server component and avoids serializing row ids twice.
 */
export function SelectAllCheckbox({ name, label, disabled }: SelectAllCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);

  function toggle(checked: boolean) {
    const table = ref.current?.closest("table");
    if (!table) return;
    const boxes = table.querySelectorAll<HTMLInputElement>(
      `tbody input[type="checkbox"][name="${CSS.escape(name)}"]:not(:disabled)`
    );
    boxes.forEach((box) => {
      box.checked = checked;
    });
  }

  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      disabled={disabled}
      onChange={(event) => toggle(event.target.checked)}
    />
  );
}
