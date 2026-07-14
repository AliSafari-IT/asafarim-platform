"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@asafarim/ui";
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

  async function handleDelete() {
    setError("");
    if (
      !window.confirm(
        `Delete the "${roleName}" role permanently?\n\n${userCount} user${
          userCount === 1 ? "" : "s"
        } will lose this role. This cannot be undone.`
      )
    ) {
      return;
    }

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
        onClick={handleDelete}
      >
        {pending ? "deleting…" : "delete role"}
      </Button>
    </div>
  );
}
