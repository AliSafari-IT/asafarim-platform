"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button } from "@asafarim/ui";
import { setRolePermissions } from "../../actions";

export interface PermissionOption {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  group: string;
}

export function PermissionGrantsEditor({
  roleId,
  roleName,
  affectedUsers,
  permissions,
  initialGrantedIds,
  disabled,
}: {
  roleId: string;
  roleName: string;
  affectedUsers: number;
  permissions: PermissionOption[];
  initialGrantedIds: string[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const [granted, setGranted] = useState<Set<string>>(
    () => new Set(initialGrantedIds)
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const initial = useMemo(() => new Set(initialGrantedIds), [initialGrantedIds]);
  const added = [...granted].filter((id) => !initial.has(id));
  const removed = [...initial].filter((id) => !granted.has(id));
  const dirty = added.length > 0 || removed.length > 0;

  const groups = useMemo(() => {
    const byGroup = new Map<string, PermissionOption[]>();
    for (const permission of permissions) {
      const list = byGroup.get(permission.group) ?? [];
      list.push(permission);
      byGroup.set(permission.group, list);
    }
    return [...byGroup.entries()];
  }, [permissions]);

  function toggle(id: string) {
    setSaved(false);
    setGranted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setError("");
    const nameOf = (id: string) =>
      permissions.find((p) => p.id === id)?.name ?? id;
    const summary = [
      added.length ? `grant: ${added.map(nameOf).join(", ")}` : null,
      removed.length ? `revoke: ${removed.map(nameOf).join(", ")}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    if (
      !window.confirm(
        `Apply permission changes to "${roleName}"?\n\n${summary}\n\nThis affects ${affectedUsers} user${
          affectedUsers === 1 ? "" : "s"
        } holding the role.`
      )
    ) {
      return;
    }

    setSaving(true);
    try {
      const result = await setRolePermissions({
        roleId,
        permissionIds: [...granted],
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div
        style={{
          display: "grid",
          gap: "var(--space-4)",
          gridTemplateColumns: "repeat(auto-fit, minmax(15rem, 1fr))",
          marginBottom: "var(--space-4)",
        }}
      >
        {groups.map(([group, options]) => (
          <fieldset
            key={group}
            style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-xs)", padding: "var(--space-3)" }}
          >
            <legend className="u-mono" style={{ padding: "0 var(--space-2)" }}>
              {group}
            </legend>
            {options.map((permission) => (
              <label
                key={permission.id}
                style={{
                  display: "flex",
                  gap: "var(--space-2)",
                  alignItems: "baseline",
                  padding: "0.2rem 0",
                  fontSize: "var(--text-sm)",
                  cursor: disabled ? "default" : "pointer",
                }}
                title={permission.description ?? undefined}
              >
                <input
                  type="checkbox"
                  checked={granted.has(permission.id)}
                  onChange={() => toggle(permission.id)}
                  disabled={disabled || saving}
                />
                <span>
                  {permission.displayName}{" "}
                  <span className="u-mono">{permission.name}</span>
                </span>
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", flexWrap: "wrap" }}>
        <Button
          type="button"
          variant="console"
          size="sm"
          disabled={!dirty || saving || disabled}
          onClick={handleSave}
        >
          {saving ? "saving…" : "save grants"}
        </Button>
        {dirty ? (
          <span className="u-mono">
            +{added.length} / −{removed.length} pending
          </span>
        ) : null}
        {saved && !dirty ? <Badge tone="success">saved</Badge> : null}
      </div>
    </div>
  );
}
