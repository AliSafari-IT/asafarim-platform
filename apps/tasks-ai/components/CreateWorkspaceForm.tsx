"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, FieldError, FormRow, Input, Label } from "@asafarim/ui";
import { api, ClientApiError } from "../lib/client/api";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function CreateWorkspaceForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const effectiveSlug = slugTouched ? slug : slugify(name);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const ws = await api.createWorkspace({ name: name.trim(), slug: effectiveSlug });
      router.push(`/w/${ws.slug}`);
    } catch (err) {
      setError(
        err instanceof ClientApiError && err.code === "conflict_unique"
          ? "That URL is taken. Try another."
          : err instanceof Error
            ? err.message
            : "Something went wrong.",
      );
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate style={{ maxWidth: "26rem" }}>
      <FormRow>
        <Label htmlFor="ws-name">Workspace name</Label>
        <Input
          id="ws-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme Delivery"
          required
          autoFocus
        />
      </FormRow>
      <FormRow>
        <Label htmlFor="ws-slug">URL</Label>
        <Input
          id="ws-slug"
          value={effectiveSlug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          pattern="[a-z0-9]([a-z0-9-]*[a-z0-9])?"
          aria-describedby="ws-slug-hint"
        />
        <span id="ws-slug-hint" className="ta-hint">
          tasks-ai.asafarim.com/w/<strong>{effectiveSlug || "…"}</strong>
        </span>
      </FormRow>
      {error && <FieldError>{error}</FieldError>}
      <Button type="submit" disabled={busy || !name.trim() || !effectiveSlug}>
        {busy ? "Creating…" : "Create workspace"}
      </Button>
    </form>
  );
}
