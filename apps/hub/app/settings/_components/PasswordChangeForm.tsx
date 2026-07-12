"use client";

import { useState } from "react";
import { Alert, Button, FormRow } from "@asafarim/ui";
import { PasswordField } from "../../_components/PasswordField";

export function PasswordChangeForm({ hasPassword }: { hasPassword: boolean }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: hasPassword ? currentPassword : undefined,
          newPassword,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not update password.");
        return;
      }
      setSaved(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {saved ? <Alert tone="info">Password updated.</Alert> : null}

      {hasPassword ? (
        <PasswordField
          id="current-password"
          label="Current password"
          value={currentPassword}
          onChange={setCurrentPassword}
          autoComplete="current-password"
          required
        />
      ) : (
        <FormRow>
          <p className="u-muted">
            Your account currently signs in via Google only. Set a password to also enable
            email/password sign-in.
          </p>
        </FormRow>
      )}

      <PasswordField
        id="new-password"
        label={hasPassword ? "New password" : "Password"}
        value={newPassword}
        onChange={setNewPassword}
        autoComplete="new-password"
        required
      />
      <PasswordField
        id="confirm-new-password"
        label="Confirm new password"
        value={confirmPassword}
        onChange={setConfirmPassword}
        autoComplete="new-password"
        required
      />

      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : hasPassword ? "Update password" : "Set password"}
      </Button>
    </form>
  );
}
