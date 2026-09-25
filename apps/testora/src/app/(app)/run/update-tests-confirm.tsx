"use client";

import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import type { SeedImpact } from "@/db/seedDatabase";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCanManage } from "@/components/viewer-role";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Confirmation for an "Update tests" run that would delete data. Shown only
 * when the server refused the update (409) — i.e. something in the database
 * is no longer defined in code and would be pruned together with every
 * stored result under it. Nothing has changed until the user confirms.
 */
export function UpdateTestsConfirm({
  impact,
  busy,
  onCancel,
  onConfirm,
}: {
  impact: SeedImpact | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // Confirming a deletion is admin-only (the API answers 403 for members), so
  // members see what an update would remove but can only cancel.
  const canManage = useCanManage();
  const groups = impact
    ? [
        { label: "Apps", items: impact.apps.map((a) => a.name) },
        { label: "Requirements", items: impact.requirements.map((r) => r.title) },
        { label: "Suites", items: impact.suites.map((s) => s.title) },
        { label: "Fixtures", items: impact.fixtures.map((f) => f.title) },
      ].filter((g) => g.items.length > 0)
    : [];

  return (
    <Dialog open={impact !== null} onOpenChange={(open) => !open && !busy && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            This update deletes tests and results
          </DialogTitle>
          <DialogDescription>
            These entries are no longer defined in the test code, so updating removes them — together
            with every stored result under them. This can’t be undone.
          </DialogDescription>
        </DialogHeader>

        {impact && (
          <div className="flex flex-col gap-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Test cases removed" value={impact.cases} />
              <Stat label="Stored results deleted" value={impact.results} danger={impact.results > 0} />
            </div>

            {groups.map((group) => (
              <div key={group.label}>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {group.label} ({group.items.length})
                </p>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {group.items.slice(0, 5).map((item, i) => (
                    <li key={`${item}-${i}`} className="truncate text-foreground">
                      · {item}
                    </li>
                  ))}
                  {group.items.length > 5 && (
                    <li className="text-muted-foreground">
                      · and {plural(group.items.length - 5, "more", "more")}
                    </li>
                  )}
                </ul>
              </div>
            ))}

            {!canManage && (
              <p className="rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-foreground">
                Only an admin can confirm an update that deletes tests or results. Nothing has been
                changed — ask an admin to run “Update tests”.
              </p>
            )}

            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Tests added through the forms (not in the test code) are removed by an update too. To keep
              something, add it to the test code first.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            {canManage ? "Cancel" : "Close"}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy} hidden={!canManage}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete &amp; update
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className={danger ? "text-2xl font-semibold text-destructive" : "text-2xl font-semibold"}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
