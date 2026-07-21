"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Save } from "lucide-react";

interface FrOption {
  id: string;
  title: string;
}

interface SuiteFormProps {
  mode?: "create" | "edit";
  initial?: { suiteId: string; frId: string; title: string; description: string };
  defaultFrId?: string;
  frOptions: FrOption[];
  onSuccess?: () => void;
}

export function SuiteForm({ mode = "create", initial, defaultFrId, frOptions, onSuccess }: SuiteFormProps) {
  const router = useRouter();
  const [suiteId, setSuiteId] = useState(initial?.suiteId ?? "");
  const [frId, setFrId] = useState(initial?.frId ?? defaultFrId ?? frOptions[0]?.id ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(mode === "edit" ? `/api/suites/${initial?.suiteId}` : "/api/suites", {
        method: mode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "edit" ? { title, description, frId } : { suiteId, frId, title, description },
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Failed to save suite");
        return;
      }
      if (mode === "create") {
        setSuiteId("");
        setTitle("");
        setDescription("");
      }
      onSuccess?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save suite");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="suite-id">Id</Label>
          <Input
            id="suite-id"
            placeholder="login-flow"
            value={suiteId}
            onChange={(e) => setSuiteId(e.target.value)}
            required
            disabled={mode === "edit"}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="suite-title">Title</Label>
          <Input id="suite-title" placeholder="Login Flow" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="suite-fr">Functional requirement</Label>
        <select
          id="suite-fr"
          className="h-9 rounded-md border border-border bg-muted px-3 text-sm"
          value={frId}
          onChange={(e) => setFrId(e.target.value)}
        >
          {frOptions.map((fr) => (
            <option key={fr.id} value={fr.id}>
              {fr.title}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="suite-description">Description</Label>
        <Input
          id="suite-description"
          placeholder="Covers all login scenarios using email/password."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={submitting} className="self-start">
        {mode === "edit" ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        {submitting ? "Saving..." : mode === "edit" ? "Save changes" : "Create suite"}
      </Button>
    </form>
  );
}
