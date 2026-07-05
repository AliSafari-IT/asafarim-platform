import type { CSSProperties } from "react";
import type { NavItem } from "./TopNav";

const listStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
  listStyle: "none",
  margin: 0,
  padding: 0,
};

export interface SideNavProps {
  title?: string;
  items: NavItem[];
}

export function SideNav({ title, items }: SideNavProps) {
  return (
    <nav>
      {title ? (
        <div
          style={{
            fontSize: "0.75rem",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#64748b",
            marginBottom: "0.75rem",
          }}
        >
          {title}
        </div>
      ) : null}
      <ul style={listStyle}>
        {items.map((item) => (
          <li key={item.href + item.label}>
            <a
              href={item.href}
              style={{
                display: "block",
                padding: "0.45rem 0.75rem",
                borderRadius: "0.4rem",
                color: item.active ? "#38bdf8" : "#cbd5e1",
                backgroundColor: item.active ? "#111827" : "transparent",
                textDecoration: "none",
                fontSize: "0.95rem",
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
