import type { ReactNode } from "react";

export interface PageHeaderProps {
  title: string;
  description?: string;
  /** Right-aligned actions (buttons, links). */
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "1rem",
        marginBottom: "1.5rem",
        borderBottom: "1px solid #1e293b",
        paddingBottom: "1rem",
      }}
    >
      <div>
        <h1 style={{ margin: 0, fontSize: "1.6rem", color: "#f1f5f9" }}>{title}</h1>
        {description ? (
          <p style={{ margin: "0.4rem 0 0", color: "#94a3b8" }}>{description}</p>
        ) : null}
      </div>
      {actions ? <div>{actions}</div> : null}
    </div>
  );
}
