import type { ReactNode } from "react";
import { Badge } from "./Badge";

export interface UserMenuProps {
  name?: string | null;
  email?: string | null;
  roles?: string[];
  /** Usually a <form> with a sign-out button (server action). */
  children?: ReactNode;
}

function initials(name?: string | null, email?: string | null): string {
  const source = name?.trim() || email || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

/**
 * Compact identity dropdown for the AppShell header: an avatar chip that
 * opens a panel with the full identity, roles, and sign-out action.
 * CSS-only (<details>), no client JS.
 */
export function UserMenu({ name, email, roles = [], children }: UserMenuProps) {
  return (
    <details className="ui-menu">
      <summary aria-label="Account menu">
        <span className="ui-avatar" aria-hidden="true">
          {initials(name, email)}
        </span>
        <span className="ui-usermenu__label">{name ?? email}</span>
        <span className="ui-menu__caret" aria-hidden="true">
          ▾
        </span>
      </summary>
      <div className="ui-menu__panel">
        <div className="ui-menu__section">
          <div className="ui-usermenu__name">{name ?? "Signed in"}</div>
          {email ? <div className="ui-usermenu__email">{email}</div> : null}
          {roles.length > 0 ? (
            <div className="ui-usermenu__roles">
              {roles.map((role) => (
                <Badge
                  key={role}
                  tone={
                    role === "superadmin" || role === "admin" ? "info" : "neutral"
                  }
                >
                  {role}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
        {children ? (
          <>
            <hr className="ui-menu__divider" />
            <div className="ui-menu__section">{children}</div>
          </>
        ) : null}
      </div>
    </details>
  );
}
