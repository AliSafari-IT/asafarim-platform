import type { ReactNode } from "react";
import { Badge } from "./Badge";

export interface UserMenuProps {
  name?: string | null;
  email?: string | null;
  roles?: string[];
  /** Usually a <form> with a sign-out button (server action). */
  children?: ReactNode;
}

/**
 * Compact signed-in user display for the AppShell header.
 * Pure display component — pass session data and a sign-out form from the app.
 */
export function UserMenu({ name, email, roles = [], children }: UserMenuProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      <div style={{ textAlign: "right", lineHeight: 1.3 }}>
        <div style={{ fontSize: "0.9rem", color: "#e2e8f0" }}>
          {name ?? email ?? "Signed in"}
        </div>
        {roles.length > 0 ? (
          <div style={{ display: "flex", gap: "0.3rem", justifyContent: "flex-end" }}>
            {roles.map((role) => (
              <Badge key={role} tone={role === "superadmin" || role === "admin" ? "info" : "neutral"}>
                {role}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}
