"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, ConfirmDialog } from "@asafarim/ui";
import { deleteRole } from "../../actions";

export function DeleteRoleControl({
  roleId,
  roleName,
  userCount,
}: {
  roleId: string;
  roleName: string;
  userCount: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  async function handleDelete() {
    setConfirming(false);
    setError("");
    setPending(true);
    try {
      const result = await deleteRole({ roleId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/roles");
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
      <Button
        type="button"
        variant="danger"
        size="sm"
        disabled={pending}
        onClick={() => setConfirming(true)}
      >
        {pending ? "deleting…" : "delete role"}
      </Button>

      <ConfirmDialog
        open={confirming}
        title={`Delete the "${roleName}" role permanently?`}
        message={`${userCount} user${userCount === 1 ? "" : "s"} will lose this role. This cannot be undone.`}
        confirmLabel="Delete role"
        tone="danger"
        confirmDisabled={pending}
        onCancel={() => setConfirming(false)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
