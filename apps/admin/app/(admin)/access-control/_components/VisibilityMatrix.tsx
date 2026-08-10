"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, ConfirmDialog } from "@asafarim/ui";
import { saveModuleVisibility } from "../actions";

export interface MatrixModule {
  id: string;
  label: string;
  description: string;
  group: "console" | "apps";
  defaultRoles: string[];
}

export interface VisibilityMatrixProps {
  modules: MatrixModule[];
  roles: string[];
  /** Stored overrides only — modules on their default are absent. */
  overrides: Record<string, string[]>;
  superadminRole: string;
}

type Matrix = Record<string, string[]>;

function buildMatrix(modules: MatrixModule[], overrides: Record<string, string[]>): Matrix {
  const out: Matrix = {};
  for (const module of modules) {
    out[module.id] = overrides[module.id] ?? [...module.defaultRoles];
  }
  return out;
}

function sameRoles(a: string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((role) => b.includes(role));
}

const GROUP_TITLES: Record<string, string> = {
  console: "admin console sections",
  apps: "platform apps",
};

export function VisibilityMatrix({
  modules,
  roles,
  overrides,
  superadminRole,
}: VisibilityMatrixProps) {
  const router = useRouter();
  const initial = useMemo(() => buildMatrix(modules, overrides), [modules, overrides]);
  const [matrix, setMatrix] = useState<Matrix>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const byId = useMemo(
    () => new Map(modules.map((module) => [module.id, module])),
    [modules]
  );

  const dirtyIds = useMemo(
    () =>
      modules
        .filter((module) => !sameRoles(matrix[module.id] ?? [], initial[module.id] ?? []))
        .map((module) => module.id),
    [matrix, initial, modules]
  );

  function toggle(moduleId: string, role: string) {
    // Superadmin visibility is not editable: hiding this very page from
    // superadmin would remove the only way to undo it.
    if (role === superadminRole) return;
    setSaved(false);
    setMatrix((prev) => {
      const current = prev[moduleId] ?? [];
      const next = current.includes(role)
        ? current.filter((r) => r !== role)
        : [...current, role];
      return { ...prev, [moduleId]: next };
    });
  }

  function resetAll() {
    setSaved(false);
    setMatrix(buildMatrix(modules, {}));
  }

  async function save() {
    setPending(true);
    setError("");
    try {
      const result = await saveModuleVisibility({ matrix });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const groups: Array<"console" | "apps"> = ["console", "apps"];

  return (
    <>
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="ui-filterbar">
        <span className="ui-filterbar__label u-mono">
          {dirtyIds.length > 0
            ? `${dirtyIds.length} unsaved change${dirtyIds.length === 1 ? "" : "s"}`
            : "no unsaved changes"}
        </span>
        <span className="ui-chips">
          {saved ? <Badge tone="success">saved</Badge> : null}
        </span>
        <span className="ui-filterbar__trailing">
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={resetAll}>
            reset all to defaults
          </Button>
          <Button
            type="button"
            variant="console"
            size="sm"
            disabled={pending || dirtyIds.length === 0}
            onClick={() => setConfirming(true)}
          >
            {pending ? "saving…" : "save matrix"}
          </Button>
        </span>
      </div>

      {groups.map((group) => {
        const rows = modules.filter((module) => module.group === group);
        if (rows.length === 0) return null;
        return (
          <section key={group} className="ui-matrix">
            <header className="ui-matrix__head">
              <span className="u-mono">{GROUP_TITLES[group]}</span>
              <span className="u-mono">{rows.length}</span>
            </header>
            <div className="ui-tablewrap">
              <table className="ui-table ui-table--nowrap">
                <thead>
                  <tr>
                    <th>Module</th>
                    {roles.map((role) => (
                      <th key={role} style={{ textAlign: "center" }}>
                        {role}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((module) => {
                    const current = matrix[module.id] ?? [];
                    const isDirty = dirtyIds.includes(module.id);
                    return (
                      <tr key={module.id}>
                        <td>
                          <span className="ui-table__primary">
                            {module.label}
                            <span className="ui-table__sub">
                              <span className="u-mono">{module.id}</span>
                              {" — "}
                              {module.description}
                            </span>
                          </span>
                        </td>
                        {roles.map((role) => {
                          const visible =
                            role === superadminRole || current.includes(role);
                          const isDefault = byId
                            .get(module.id)!
                            .defaultRoles.includes(role);
                          const overridden =
                            role !== superadminRole && visible !== isDefault;
                          const locked = role === superadminRole;
                          return (
                            <td key={role} style={{ textAlign: "center" }}>
                              <button
                                type="button"
                                disabled={locked}
                                onClick={() => toggle(module.id, role)}
                                className={[
                                  "ui-matrix__cell",
                                  visible ? "is-visible" : "",
                                  overridden ? "is-overridden" : "",
                                  locked ? "is-locked" : "",
                                  isDirty ? "is-dirty" : "",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                                aria-pressed={visible}
                                aria-label={`${module.label}: ${
                                  visible ? "visible to" : "hidden from"
                                } ${role}`}
                                title={
                                  locked
                                    ? "Superadmin always sees every module"
                                    : overridden
                                      ? `Overridden — default is ${
                                          isDefault ? "visible" : "hidden"
                                        }`
                                      : "Registry default"
                                }
                              >
                                {visible ? "✓" : "·"}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <ConfirmDialog
        open={confirming}
        title="Apply navigation visibility?"
        message={`${dirtyIds.length} module${
          dirtyIds.length === 1 ? "" : "s"
        } will change in the menus every affected role sees. This changes navigation only — no route gate, permission, or app access rule is affected.`}
        confirmLabel="Apply matrix"
        confirmDisabled={pending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          void save();
        }}
      />
    </>
  );
}
