"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCanManage } from "@/components/viewer-role";

interface SecretRow {
  name: string;
  updatedAt: string;
}

/**
 * Admin-only panel for a target's test credentials (#702). Values are
 * write-only: the list shows names and when they changed, never values.
 * Scripts read them as process.env.NAME and test data as {{NAME}}.
 */
export function TargetSecrets({ targetId }: { targetId: string }) {
  const canManage = useCanManage();
  const [rows, setRows] = useState<SecretRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/targets/secrets?targetId=${encodeURIComponent(targetId)}`);
      const data = await res.json().catch(() => []);
      setRows(Array.isArray(data) ? (data as SecretRow[]) : []);
    } finally {
      setLoading(false);
    }
  }, [targetId]);

  useEffect(() => {
    if (canManage) void load();
  }, [canManage, load]);

  if (!canManage) return null;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/targets/secrets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId, name: name.trim(), value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not save the secret");
        return;
      }
      setName("");
      setValue("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function performDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/targets/secrets?targetId=${encodeURIComponent(targetId)}&name=${encodeURIComponent(confirmDelete)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : "Could not delete the secret");
        return;
      }
      setConfirmDelete(null);
      await load();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3" data-testid="target-secrets">
      <div className="flex items-center gap-2 text-sm font-medium">
        <KeyRound className="h-4 w-4" /> Test credentials for this target
        {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>
      <p className="text-xs text-muted-foreground">
        Scripts read these as <code>process.env.NAME</code> and test data as <code>{"{{NAME}}"}</code>. Values
        are encrypted and never shown again; nothing else from the server environment reaches a run.
      </p>
      {rows.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {rows.map((row) => (
            <li key={row.name} className="flex items-center justify-between gap-2 text-xs">
              <code>{row.name}</code>
              <span className="ml-auto text-muted-foreground">
                updated {new Date(row.updatedAt).toLocaleString()}
              </span>
              <button
                type="button"
                onClick={() => setConfirmDelete(row.name)}
                className="rounded p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                aria-label={`Delete ${row.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        !loading && <p className="text-xs text-muted-foreground">No secrets for this target yet.</p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Name
          <input
            className="h-8 rounded-md border border-border bg-muted px-2 text-sm text-foreground"
            placeholder="ADMIN_PASSWORD"
            value={name}
            onChange={(event) => setName(event.target.value.toUpperCase())}
            disabled={saving}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Value (set or replace)
          <input
            type="password"
            autoComplete="new-password"
            className="h-8 rounded-md border border-border bg-muted px-2 text-sm text-foreground"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            disabled={saving}
          />
        </label>
        <Button size="sm" onClick={() => void save()} disabled={saving || !name.trim() || !value}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Save secret
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}

      <Dialog open={confirmDelete !== null} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {confirmDelete}?</DialogTitle>
            <DialogDescription>
              Runs against this target will no longer get this value. Tests that use it will fail with
              &ldquo;unknown secret&rdquo; until it is set again.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void performDelete()} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
