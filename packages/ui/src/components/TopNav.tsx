import type { CSSProperties } from "react";

export interface NavItem {
  label: string;
  href: string;
  /** Highlight as the current section. */
  active?: boolean;
  /** Render with target=_blank (cross-app links stay same-tab by default). */
  newTab?: boolean;
}

const listStyle: CSSProperties = {
  display: "flex",
  gap: "1.1rem",
  listStyle: "none",
  margin: 0,
  padding: 0,
  flexWrap: "wrap",
  alignItems: "center",
};

export interface TopNavProps {
  items: NavItem[];
}

export function TopNav({ items }: TopNavProps) {
  return (
    <nav>
      <ul style={listStyle}>
        {items.map((item) => (
          <li key={item.href + item.label}>
            <a
              href={item.href}
              target={item.newTab ? "_blank" : undefined}
              rel={item.newTab ? "noreferrer" : undefined}
              style={{
                color: item.active ? "#38bdf8" : "#cbd5e1",
                textDecoration: "none",
                fontSize: "0.95rem",
                fontWeight: item.active ? 600 : 400,
              }}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
