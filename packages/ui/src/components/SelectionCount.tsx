"use client";

import { useEffect, useState } from "react";

export interface SelectionCountProps {
  name: string;
  noun: string;
}

/** Live "N selected" readout for BulkActionBar, driven by the DOM only. */
export function SelectionCount({ name, noun }: SelectionCountProps) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    // Delegated on document because the checkboxes live in a sibling
    // subtree (the table) that this component does not own.
    function recount() {
      const boxes = document.querySelectorAll<HTMLInputElement>(
        `input[type="checkbox"][name="${CSS.escape(name)}"]:checked`
      );
      setCount(boxes.length);
    }
    document.addEventListener("change", recount);
    recount();
    return () => document.removeEventListener("change", recount);
  }, [name]);

  return (
    <span className="u-mono ui-bulkbar__count">
      {count} {noun}
      {count === 1 ? "" : "s"} selected
    </span>
  );
}
