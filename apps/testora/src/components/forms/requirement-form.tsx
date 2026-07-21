"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Save } from "lucide-react";

interface RequirementFormProps {
  mode?: "create" | "edit";
  initial?: { id: string; title: string; description: string; baseUrl?: string | null };
  onSuccess?: () => void;
}

export function RequirementForm({ mode = "create", initial, onSuccess }: RequirementFormProps) {
  const router = useRouter();
  const [id, setId] = useState(initial?.id ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(mode === "edit" ? `/api/requirements/${initial?.id}` : "/api/requirements", {
        method: mode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "edit" ? { title, description, baseUrl } : { id, title, description, baseUrl },
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Failed to save requirement");
        return;
      }
      if (mode === "create") {
        setId("");
        setTitle("");
        setDescription("");
        setBaseUrl("");
      }
      onSuccess?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save requirement");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fr-id">Id</Label>
          <Input
            id="fr-id"
            placeholder="auth"
            value={id}
            onChange={(e) => setId(e.target.value)}
            required
            disabled={mode === "edit"}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fr-title">Title</Label>
          <Input id="fr-title" placeholder="Authentication" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fr-description">Description</Label>
        <Input
          id="fr-description"
          placeholder="Covers all login and signup flows."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fr-base-url">
          Base URL (optional — environment root shared by every suite/fixture under this requirement)
        </Label>
        <Input
          id="fr-base-url"
          placeholder="http://localhost:3233 or https://app.example.com"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={submitting} className="self-start">
        {mode === "edit" ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        {submitting ? "Saving..." : mode === "edit" ? "Save changes" : "Create requirement"}
      </Button>
    </form>
  );
}
