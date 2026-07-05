export interface NavItem {
  label: string;
  href: string;
  /** Highlight as the current section. */
  active?: boolean;
  /** Render with target=_blank (cross-app links stay same-tab by default). */
  newTab?: boolean;
}

export interface TopNavProps {
  items: NavItem[];
}

/**
 * Primary in-app navigation. Renders an inline list on desktop and a
 * CSS-only menu button below 900px — never wraps.
 */
export function TopNav({ items }: TopNavProps) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Primary">
      <ul className="ui-topnav">
        {items.map((item) => (
          <li key={item.href + item.label}>
            <a
              href={item.href}
              target={item.newTab ? "_blank" : undefined}
              rel={item.newTab ? "noreferrer" : undefined}
              aria-current={item.active ? "true" : undefined}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
      <details className="ui-menu ui-topnav-mobile">
        <summary>
          Menu <span className="ui-menu__caret">▾</span>
        </summary>
        <div className="ui-menu__panel" style={{ left: 0, right: "auto" }}>
          {items.map((item) => (
            <a
              key={item.href + item.label}
              href={item.href}
              className="ui-menu__item"
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
