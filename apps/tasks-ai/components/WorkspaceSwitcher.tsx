"use client";

import { useEffect, useRef, useState } from "react";

export interface SwitcherWorkspace {
  id: string;
  name: string;
  slug: string;
  role: string;
}

/**
 * Workspace identity + switcher (issue #369). Differentiated from
 * navigation — it's a trigger for "which workspace am I in / where else can
 * I go", not a nav destination itself. Follows the same manual-popover
 * pattern as NotificationBell (no generic Menu/Select primitive exists in
 * @asafarim/ui for this shape).
 */
export function WorkspaceSwitcher({
  slug,
  workspaceName,
  workspaces,
}: {
  slug: string;
  workspaceName: string;
  workspaces: SwitcherWorkspace[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Nothing to switch to — still show identity, just not as a control that
  // opens an empty menu.
  if (workspaces.length <= 1) {
    return <span className="ta-ws__switcherlabel">{workspaceName}</span>;
  }

  return (
    <div className="ta-ws__switcher" ref={ref}>
      <button
        type="button"
        className="ta-ws__switcherbtn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {workspaceName}
        <span aria-hidden className="ta-ws__switchercaret">
          ▾
        </span>
      </button>
      {open && (
        <div className="ta-ws__switchermenu" role="menu">
          <ul>
            {workspaces.map((w) => (
              <li key={w.id}>
                <a
                  href={`/w/${w.slug}`}
                  role="menuitem"
                  aria-current={w.slug === slug ? "true" : undefined}
                >
                  <span>{w.name}</span>
                  <span className="ta-ws__switcherrole">{w.role}</span>
                </a>
              </li>
            ))}
          </ul>
          <a href="/workspace" className="ta-ws__switcherall" role="menuitem">
            All workspaces
          </a>
        </div>
      )}
    </div>
  );
}
