"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, FormRow, Input, Label, Textarea } from "@asafarim/ui";
import { updateRoleMeta } from "../../actions";

export function RoleMetaForm({
  roleId,
  initialDisplayName,
  initialDescription,
  disabled,
}: {
  roleId: string;
  initialDisplayName: string;
  initialDescription: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [description, setDescription] = useState(initialDescription);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const result = await updateRoleMeta({ roleId, displayName, description });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
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
        <Label htmlFor="role-meta-displayname">Display name</Label>
        <Input
          id="role-meta-displayname"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={80}
          required
          disabled={disabled}
        />
      </FormRow>
      <FormRow>
        <Label htmlFor="role-meta-description">Description</Label>
        <Textarea
          id="role-meta-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={500}
          disabled={disabled}
        />
      </FormRow>
      <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
        <Button
          type="submit"
          variant="console"
          size="sm"
          disabled={saving || disabled}
        >
          {saving ? "saving…" : "save metadata"}
        </Button>
        {saved ? <Badge tone="success">saved</Badge> : null}
      </div>
    </form>
  );
}
