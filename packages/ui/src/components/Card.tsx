import type { CSSProperties, ReactNode } from "react";

const cardStyle: CSSProperties = {
  padding: "1.5rem 2rem",
  borderRadius: "0.75rem",
  border: "1px solid #1e293b",
  backgroundColor: "#111827",
  maxWidth: "36rem",
};

export interface CardProps {
  title?: string;
  children: ReactNode;
}

export function Card({ title, children }: CardProps) {
  return (
    <section style={cardStyle}>
      {title ? <h2 style={{ marginTop: 0, color: "#f1f5f9" }}>{title}</h2> : null}
      <div style={{ color: "#94a3b8", lineHeight: 1.6 }}>{children}</div>
    </section>
  );
}
