import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** Optional call to action (button or link). */
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div
      style={{
        border: "1px dashed #334155",
        borderRadius: "0.75rem",
        padding: "3rem 2rem",
        textAlign: "center",
        color: "#94a3b8",
      }}
    >
      <h2 style={{ margin: "0 0 0.5rem", color: "#e2e8f0", fontSize: "1.15rem" }}>
        {title}
      </h2>
      {description ? <p style={{ margin: "0 0 1rem" }}>{description}</p> : null}
      {action}
    </div>
  );
}
