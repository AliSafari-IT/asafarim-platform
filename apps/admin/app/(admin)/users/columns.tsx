import { getAccessibleApps } from "@asafarim/auth/apps";
import { ROLES } from "@asafarim/auth/roles";
import { Badge, ChipList, type BadgeTone, type ColumnDef } from "@asafarim/ui";

export interface UserRow {
  id: string;
  name: string | null;
  username: string | null;
  email: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  userRoles: { role: { name: string } }[];
}

function roleTone(role: string): BadgeTone {
  if (role === ROLES.SUPERADMIN) return "danger";
  if (role === ROLES.ADMIN) return "info";
  return "neutral";
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The users table's columns. Kept to five (plus the checkbox) so the table
 * fits its container from the stack breakpoint up: the username sits under
 * the name and email, the two dates share a cell, and long emails or
 * random usernames wrap instead of widening the table.
 */
export function userColumns(): ColumnDef<UserRow>[] {
  return [
    {
      id: "user",
      header: "User",
      render: (user) => (
        <a href={`/users/${user.id}`} className="ui-table__link">
          <span className="ui-table__primary ui-table__primary--wrap">
            {user.name ?? "—"}
            <span className="ui-table__sub">{user.email}</span>
            {user.username ? (
              <span className="ui-table__sub u-mono">@{user.username}</span>
            ) : null}
          </span>
        </a>
      ),
    },
    {
      id: "status",
      header: "Status",
      render: (user) => (
        <Badge tone={user.isActive ? "success" : "danger"}>
          {user.isActive ? "active" : "inactive"}
        </Badge>
      ),
    },
    {
      id: "roles",
      header: "Roles",
      render: (user) => {
        const roles = user.userRoles.map((ur) => ur.role.name);
        return (
          <span className="ui-chips">
            {roles.length === 0 ? (
              <span className="u-muted">—</span>
            ) : (
              roles.map((role) => (
                <Badge key={role} tone={roleTone(role)}>
                  {role}
                </Badge>
              ))
            )}
          </span>
        );
      },
    },
    {
      id: "apps",
      header: "Apps",
      render: (user) => {
        const apps = getAccessibleApps({
          roles: user.userRoles.map((ur) => ur.role.name),
          authenticated: user.isActive,
        });
        return (
          <ChipList
            noun="apps"
            items={apps.map((app) => (
              <Badge key={app.key} tone="neutral">
                {app.key}
              </Badge>
            ))}
          />
        );
      },
    },
    {
      id: "dates",
      header: (
        <>
          Created
          <span className="ui-table__sub">Updated</span>
        </>
      ),
      label: "Created / updated",
      mono: true,
      nowrap: true,
      render: (user) => (
        <>
          <span title="Created">{formatDate(user.createdAt)}</span>
          <span className="ui-table__sub" title="Updated">
            {formatDate(user.updatedAt)}
          </span>
        </>
      ),
    },
  ];
}
