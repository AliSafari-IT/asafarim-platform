"use client";

import { useState } from "react";
import { Button, Input } from "@asafarim/ui";

export function QuickAdd({ onAdd }: { onAdd: (title: string) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = title.trim();
    if (!value) return;
    setBusy(true);
    try {
      await onAdd(value);
      setTitle("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="ta-quickadd" onSubmit={submit}>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a task and press Enter"
        aria-label="Task title"
      />
      <Button type="submit" size="sm" disabled={busy || !title.trim()}>
        Add
      </Button>
    </form>
  );
}
