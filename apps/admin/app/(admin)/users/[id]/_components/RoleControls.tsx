"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button } from "@asafarim/ui";
import { assignRoleToUser, removeRoleFromUser } from "../../actions";

const ADMIN_ROLES = ["admin", "superadmin"];

export interface RoleRow {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  isSystem: boolean;
  assigned: boolean;
  assignedAt: string | null;
  assignedByEmail: string | null;
}

export function RoleControls({
  userId,
  isSelf,
  roles,
}: {
  userId: string;
  isSelf: boolean;
  roles: RoleRow[];
}) {
  const router = useRouter();
  const [pendingRoleId, setPendingRoleId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleToggle(role: RoleRow) {
    setError("");

    let confirmSelf = false;
    if (role.assigned) {
      if (isSelf && ADMIN_ROLES.includes(role.name)) {
        confirmSelf = window.confirm(
          `You are removing "${role.name}" from YOUR OWN account. If this is your final admin role you will lose access to this console. Continue?`
        );
        if (!confirmSelf) return;
      } else if (
        !window.confirm(`Remove the "${role.name}" role from this user?`)
      ) {
        return;
      }
    }

    setPendingRoleId(role.id);
    try {
      const result = role.assigned
        ? await removeRoleFromUser({ userId, roleId: role.id, confirmSelf })
        : await assignRoleToUser({ userId, roleId: role.id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPendingRoleId(null);
    }
  }

  return (
    <div>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {roles.map((role) => (
          <li
            key={role.id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "var(--space-3)",
              padding: "var(--space-2) 0",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  gap: "var(--space-2)",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontWeight: 600 }}>{role.displayName}</span>
                <span className="u-mono">{role.name}</span>
                {role.isSystem ? <Badge tone="info">system</Badge> : null}
              </div>
              {role.assigned && role.assignedAt ? (
                <div className="u-mono" style={{ marginTop: "0.15rem" }}>
                  assigned {role.assignedAt}
                  {role.assignedByEmail ? ` by ${role.assignedByEmail}` : ""}
                </div>
              ) : role.description ? (
                <div
                  className="u-muted"
                  style={{ fontSize: "var(--text-xs)", marginTop: "0.15rem" }}
                >
                  {role.description}
                </div>
              ) : null}
            </div>
            <Button
              type="button"
              variant={role.assigned ? "danger" : "console"}
              size="sm"
              disabled={pendingRoleId !== null}
              onClick={() => handleToggle(role)}
            >
              {pendingRoleId === role.id
                ? "working…"
                : role.assigned
                  ? "remove"
                  : "assign"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
