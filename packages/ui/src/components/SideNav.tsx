import type { NavItem } from "./TopNav";

export interface SideNavProps {
  title?: string;
  items: NavItem[];
}

export function SideNav({ title, items }: SideNavProps) {
  return (
    <nav className="ui-sidenav" aria-label={title ?? "Section"}>
      {title ? <div className="ui-sidenav__title">{title}</div> : null}
      <ul>
        {items.map((item) => (
          <li key={item.href + item.label}>
            <a href={item.href} className={item.active ? "is-active" : undefined}>
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
