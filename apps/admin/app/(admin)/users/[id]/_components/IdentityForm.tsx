"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, FormRow, Input, Label } from "@asafarim/ui";
import { updateUserIdentity } from "../../actions";

export function IdentityForm({
  userId,
  initialName,
  initialUsername,
  initialEmail,
}: {
  userId: string;
  initialName: string;
  initialUsername: string;
  initialEmail: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [username, setUsername] = useState(initialUsername);
  const [email, setEmail] = useState(initialEmail);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const result = await updateUserIdentity({ userId, name, username, email });
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
        <Label htmlFor="identity-name">Name</Label>
        <Input
          id="identity-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
        />
      </FormRow>
      <FormRow>
        <Label htmlFor="identity-username">Username</Label>
        <Input
          id="identity-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          minLength={3}
          maxLength={24}
          required
        />
      </FormRow>
      <FormRow>
        <Label htmlFor="identity-email">Email</Label>
        <Input
          id="identity-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </FormRow>
      <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
        <Button type="submit" variant="console" size="sm" disabled={saving}>
          {saving ? "saving…" : "save identity"}
        </Button>
        {saved ? <Badge tone="success">saved</Badge> : null}
      </div>
    </form>
  );
}
