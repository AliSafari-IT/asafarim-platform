"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, ConfirmDialog } from "@asafarim/ui";
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
  const [confirming, setConfirming] = useState(false);

  async function commitToggle(confirmSelf: boolean) {
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

  function handleToggle() {
    setError("");
    // Reactivation is safe — no confirmation needed. Deactivation always
    // asks first, through the shared dialog, never window.confirm.
    if (!isActive) {
      void commitToggle(false);
      return;
    }
    setConfirming(true);
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

      <ConfirmDialog
        open={confirming}
        title={isSelf ? "Deactivate your own account?" : "Deactivate this account?"}
        message={
          isSelf
            ? "You are about to deactivate YOUR OWN account. You will be signed out everywhere and lose access to this console."
            : "The user will no longer be able to sign in to any platform app."
        }
        confirmLabel="Deactivate"
        tone="danger"
        confirmDisabled={pending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          void commitToggle(isSelf);
        }}
      />
    </div>
  );
}
