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

export function TopNav({ items }: TopNavProps) {
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
    </nav>
  );
}
