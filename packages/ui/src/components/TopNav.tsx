"use client";

import { useEdgeAutoScroll } from "../hooks/useEdgeAutoScroll";
import { activeHref, useCurrentPath } from "../hooks/useCurrentPath";

export interface NavItem {
  label: string;
  href: string;
  /** Highlight as the current section. Omit it and TopNav works it out
   *  from the URL (longest matching same-origin link); set it to force. */
  active?: boolean;
  /** Render with target=_blank (cross-app links stay same-tab by default). */
  newTab?: boolean;
}

export interface TopNavProps {
  items: NavItem[];
  /** Render only the "Menu ▾" dropdown, and only once AppShell hides the
   *  sidebar (≤720px). For apps whose primary nav is a SideNav, so they
   *  still have navigation on mobile. */
  mobileOnly?: boolean;
}

/**
 * Primary in-app navigation. Renders an inline list on desktop and a
 * CSS-only menu button below 900px — never wraps.
 *
 * The current page is marked with aria-current="page" (styled in
 * components.css). No app passed `active`, so nothing was ever marked;
 * it's now derived from the URL unless an item sets `active` itself.
 */
export function TopNav({ items, mobileOnly = false }: TopNavProps) {
  const scroller = useEdgeAutoScroll<HTMLUListElement>();
  const pathname = useCurrentPath();
  if (items.length === 0) return null;

  const autoActive = activeHref(
    items.map((item) => item.href),
    pathname,
  );
  const isActive = (item: NavItem) => item.active ?? item.href === autoActive;

  return (
    <nav aria-label="Primary" className="ui-shell__topnav">
      {mobileOnly ? null : (
        <ul
          className="ui-topnav"
          ref={scroller.ref}
          onMouseMove={scroller.onMouseMove}
          onMouseLeave={scroller.onMouseLeave}
        >
          {items.map((item) => (
            <li key={item.href + item.label}>
              <a
                href={item.href}
                target={item.newTab ? "_blank" : undefined}
                rel={item.newTab ? "noreferrer" : undefined}
                aria-current={isActive(item) ? "page" : undefined}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      )}
      <details
        className={`ui-menu ui-topnav-mobile${mobileOnly ? " ui-topnav-mobile--side" : ""}`}
      >
        <summary>
          Menu <span className="ui-menu__caret">▾</span>
        </summary>
        <div className="ui-menu__panel" style={{ left: 0, right: "auto" }}>
          {items.map((item) => (
            <a
              key={item.href + item.label}
              href={item.href}
              className="ui-menu__item"
              aria-current={isActive(item) ? "page" : undefined}
              target={item.newTab ? "_blank" : undefined}
              rel={item.newTab ? "noreferrer" : undefined}
            >
              {item.label}
            </a>
          ))}
        </div>
      </details>
    </nav>
  );
}
