"use client";

import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface SecretsMovePrompt {
  changes: { field: string; from: string | null; to: string | null }[];
  secrets: string[];
}

const FIELD_LABEL: Record<string, string> = { baseUrl: "Site", apiUrl: "API", hubUrl: "Hub" };

/**
 * #713: this target has stored test credentials and the edit points it at a
 * different origin. Ask whether the credentials should follow it (keep) or be
 * removed (clear) — never move them silently.
 */
export function TargetSecretsMoveDialog({
  prompt,
  busy,
  onChoose,
  onCancel,
}: {
  prompt: SecretsMovePrompt | null;
  busy: boolean;
  onChoose: (action: "keep" | "clear") => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={prompt !== null} onOpenChange={(open) => !open && !busy && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> This target has stored credentials
          </DialogTitle>
          <DialogDescription>
            They were saved for the current origin. After this change, runs against this target would send them
            to the new origin.
          </DialogDescription>
        </DialogHeader>
        {prompt && (
          <div className="flex flex-col gap-3 text-sm">
            <ul className="flex flex-col gap-1">
              {prompt.changes.map((change) => (
                <li key={change.field}>
                  <span className="text-muted-foreground">{FIELD_LABEL[change.field] ?? change.field}:</span>{" "}
                  <code>{change.from ?? "(none)"}</code> → <code>{change.to ?? "(none)"}</code>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground">
              Credentials: {prompt.secrets.map((name) => <code key={name} className="mr-1">{name}</code>)}
            </p>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => onChoose("clear")} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Change and clear credentials
          </Button>
          <Button onClick={() => onChoose("keep")} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Change and keep credentials
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
