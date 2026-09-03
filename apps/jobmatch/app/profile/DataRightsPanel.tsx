"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, ConfirmDialog } from "@asafarim/ui";

/**
 * Candidate data rights, as buttons (JM-023).
 *
 * Access and erasure are things a candidate does, not things they request
 * and wait for. Both are one click, and erasure goes through the platform's
 * styled ConfirmDialog — never `window.confirm`, per the design system.
 */
export function DataRightsPanel({
  erasureSlaDays,
  hasData,
}: {
  erasureSlaDays: number;
  hasData: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const erase = useCallback(async () => {
    setBusy(true);
    setConfirming(false);
    try {
      const response = await fetch("/api/data-rights", { method: "DELETE" });
      const body = (await response.json()) as { objectsFailed?: number };
      setResult(
        body.objectsFailed && body.objectsFailed > 0
          ? "Your profile and CV records were deleted. One or more stored files could not be removed yet; this has been logged and will be retried."
          : "Everything JobMatch held for you has been deleted.",
      );
      router.refresh();
    } catch {
      setResult("The deletion could not be completed. Nothing was removed. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [router]);

  return (
    <Card title="Your data">
      <p style={{ opacity: 0.85 }}>
        JobMatch holds your uploaded CV, the profile read from it, and a log of actions taken on
        your account. Your name and email live with your ASafarIM account, not here — JobMatch only
        stores an opaque identifier for it.
      </p>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1rem" }}>
        <a href="/api/data-rights" download="jobmatch-export.json" className="ui-btn ui-btn--secondary">
          Download everything
        </a>
        <Button variant="danger" disabled={busy || !hasData} onClick={() => setConfirming(true)}>
          Delete my CV and profile
        </Button>
      </div>

      <p style={{ opacity: 0.75, marginTop: "0.75rem", fontSize: "0.9rem" }}>
        Deletion removes your uploaded files, every profile version, and the data read from them —
        not just the original. It happens immediately, well inside the {erasureSlaDays}-day
        commitment. The record that a deletion took place is kept, because it contains no CV content
        and it is the only proof the deletion happened.
      </p>

      {result ? <Alert tone="info">{result}</Alert> : null}

      <ConfirmDialog
        open={confirming}
        title="Delete your CV and profile?"
        message="This removes your uploaded files, every profile version, and everything read from them. It cannot be undone."
        confirmLabel="Delete everything"
        cancelLabel="Keep my data"
        tone="danger"
        onConfirm={() => void erase()}
        onCancel={() => setConfirming(false)}
      />
    </Card>
  );
}
