"use client";

import { useState } from "react";
import { Alert, Button } from "@asafarim/ui";
import { PasswordField } from "../../_components/PasswordField";
import styles from "../settings.module.css";

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
    <form onSubmit={handleSubmit} className={styles.pwForm}>
      {error ? (
        <div className={styles.pwFull}>
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}
      {saved ? (
        <div className={styles.pwFull}>
          <Alert tone="info">Password updated.</Alert>
        </div>
      ) : null}

      {hasPassword ? (
        <div className={styles.pwFull}>
          <PasswordField
            id="current-password"
            label="Current password"
            value={currentPassword}
            onChange={setCurrentPassword}
            autoComplete="current-password"
            required
          />
        </div>
      ) : null}

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

      <div className={`${styles.pwFull} ${styles.pwFooter}`}>
        {!hasPassword ? (
          <p className={styles.pwNote}>
            You currently sign in with an email code or Google. A password adds email &amp; password sign-in.
          </p>
        ) : null}
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : hasPassword ? "Update password" : "Set password"}
        </Button>
      </div>
    </form>
  );
}
