import type { ReactNode } from "react";

export interface AlertProps {
  tone?: "error" | "info";
  children: ReactNode;
}

export function Alert({ tone = "info", children }: AlertProps) {
  return (
    <div className={`ui-alert ui-alert--${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}
