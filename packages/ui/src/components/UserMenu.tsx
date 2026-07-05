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
 * Compact signed-in identity for the AppShell header.
 * Pure display component — pass session data and a sign-out form from the app.
 */
export function UserMenu({ name, email, roles = [], children }: UserMenuProps) {
  return (
    <div className="ui-usermenu">
      <div className="ui-usermenu__id">
        <div className="ui-usermenu__name">{name ?? email ?? "Signed in"}</div>
        {roles.length > 0 ? (
          <div className="ui-usermenu__roles">
            {roles.map((role) => (
              <Badge
                key={role}
                tone={role === "superadmin" || role === "admin" ? "info" : "neutral"}
              >
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
