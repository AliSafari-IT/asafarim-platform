"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2 } from "lucide-react";

interface DeleteButtonProps {
  url: string;
  label?: string;
  confirmText?: string;
  redirectTo?: string;
  onDeleted?: () => void;
}

export function DeleteButton({ url, label = "Delete", confirmText, redirectTo, onDeleted }: DeleteButtonProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!window.confirm(confirmText ?? "Are you sure? This cannot be undone.")) return;

    setDeleting(true);
    try {
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(typeof data.error === "string" ? data.error : "Failed to delete");
        return;
      }
      onDeleted?.();
      if (redirectTo) {
        router.push(redirectTo);
      } else {
        router.refresh();
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deleting}>
      {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      {label}
    </Button>
  );
}
