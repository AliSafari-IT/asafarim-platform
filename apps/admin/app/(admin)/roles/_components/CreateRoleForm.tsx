"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, FormRow, Input, Label, Textarea } from "@asafarim/ui";
import { createRole } from "../actions";

export function CreateRoleForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const result = await createRole({ name, displayName, description });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.roleId) {
        router.push(`/roles/${result.roleId}`);
      } else {
        setName("");
        setDisplayName("");
        setDescription("");
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <FormRow>
        <Label htmlFor="role-name">Name (machine key)</Label>
        <Input
          id="role-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. content_editor"
          required
        />
      </FormRow>
      <FormRow>
        <Label htmlFor="role-displayname">Display name</Label>
        <Input
          id="role-displayname"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="e.g. Content Editor"
          required
        />
      </FormRow>
      <FormRow>
        <Label htmlFor="role-description">Description</Label>
        <Textarea
          id="role-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          maxLength={500}
        />
      </FormRow>
      <Button type="submit" variant="console" size="sm" disabled={saving}>
        {saving ? "creating…" : "create role"}
      </Button>
    </form>
  );
}
