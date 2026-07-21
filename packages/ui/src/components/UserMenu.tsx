import type { ReactNode } from "react";
import { Badge } from "./Badge";

export interface UserMenuProps {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  roles?: string[];
  /** When set, renders a "View profile →" link inside the panel. */
  profileHref?: string;
  /** Usually a <form> with a sign-out button (server action). */
  children?: ReactNode;
  /**
   * Shared `name` for the native <details> exclusive-accordion group: when
   * set, opening this menu auto-closes any other <details name="..."> with
   * the same value (e.g. the header's <AppSwitcher />). CSS-only, no JS.
   */
  groupName?: string;
}

function initials(name?: string | null, email?: string | null): string {
  const source = name?.trim() || email || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

/**
 * Compact identity dropdown for the AppShell header: an avatar chip that
 * opens a panel with the full identity, roles, and sign-out action.
 * CSS-only (<details>), no client JS.
 */
export function UserMenu({
  name,
  email,
  image,
  roles = [],
  profileHref,
  children,
  groupName = "ui-header-menu",
}: UserMenuProps) {
  return (
    <details className="ui-menu" name={groupName}>
      <summary aria-label="Account menu">
        <span className="ui-avatar" aria-hidden="true">
          {image ? (
            <img src={image} alt="" className="ui-avatar__image" referrerPolicy="no-referrer" />
          ) : (
            initials(name, email)
          )}
        </span>
        <span className="ui-usermenu__label">{name ?? email}</span>
        <span className="ui-menu__caret" aria-hidden="true">
          ▾
        </span>
      </summary>
      <div className="ui-menu__panel">
        <div className="ui-menu__section">
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
            {image ? (
              <img
                src={image}
                alt=""
                width={40}
                height={40}
                style={{ borderRadius: "50%", objectFit: "cover" }}
                referrerPolicy="no-referrer"
              />
            ) : (
              <span
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: "var(--surface-2, #333)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: "var(--text-muted)",
                }}
                aria-hidden="true"
              >
                {initials(name, email)}
              </span>
            )}
            <div>
              <div className="ui-usermenu__name">{name ?? "Signed in"}</div>
              {email ? <div className="ui-usermenu__email">{email}</div> : null}
            </div>
          </div>
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
        {profileHref ? (
          <>
            <hr className="ui-menu__divider" />
            <div className="ui-menu__section">
              <a href={profileHref}>View profile →</a>
            </div>
          </>
        ) : null}
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
