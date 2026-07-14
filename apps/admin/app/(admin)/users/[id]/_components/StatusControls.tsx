"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button } from "@asafarim/ui";
import { setUserActiveState } from "../../actions";

export function StatusControls({
  userId,
  isActive,
  isSelf,
  deactivatedAt,
}: {
  userId: string;
  isActive: boolean;
  isSelf: boolean;
  deactivatedAt: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleToggle() {
    setError("");

    let confirmSelf = false;
    if (!isActive) {
      // Reactivation is safe — no confirmation needed.
    } else if (isSelf) {
      confirmSelf = window.confirm(
        "You are about to deactivate YOUR OWN account. You will be signed out everywhere and lose access to this console. Continue?"
      );
      if (!confirmSelf) return;
    } else if (
      !window.confirm(
        "Deactivate this account? The user will no longer be able to sign in to any platform app."
      )
    ) {
      return;
    }

    setPending(true);
    try {
      const result = await setUserActiveState({
        userId,
        active: !isActive,
        confirmSelf,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          marginBottom: "var(--space-3)",
          flexWrap: "wrap",
        }}
      >
        <Badge tone={isActive ? "success" : "danger"}>
          {isActive ? "active" : "inactive"}
        </Badge>
        {deactivatedAt ? (
          <span className="u-mono">deactivated {deactivatedAt}</span>
        ) : null}
      </div>
      <p className="u-muted" style={{ fontSize: "var(--text-xs)" }}>
        {isActive
          ? "Deactivating blocks sign-in across every platform app and stamps deactivatedAt."
          : "Reactivating restores sign-in immediately; deactivatedAt is cleared."}
      </p>
      <Button
        type="button"
        variant={isActive ? "danger" : "console"}
        size="sm"
        disabled={pending}
        onClick={handleToggle}
      >
        {pending
          ? "working…"
          : isActive
            ? isSelf
              ? "deactivate my account"
              : "deactivate account"
            : "activate account"}
      </Button>
    </div>
  );
}
