"use client";

import { useEffect } from "react";
import { Alert, Button, PageHeader } from "@asafarim/ui";

/**
 * Route-level error boundary. It deliberately shows the user nothing from
 * `error.message`: JobMatch errors originate in a database driver and, from
 * M3, in third-party connectors, and those messages routinely embed
 * connection details and request payloads. The digest is the handle an
 * operator uses to find the matching server log line.
 */
export default function JobMatchError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(JSON.stringify({ event: "route.error", digest: error.digest ?? null }));
  }, [error.digest]);

  return (
    <>
      <PageHeader kicker="Error" title="Something went wrong on our side." />
      <Alert tone="error">
        <strong>This request could not be completed.</strong>{" "}
        The failure has been logged. If you report it, quote reference{" "}
        <code className="jm-mono">{error.digest ?? "unavailable"}</code>.
      </Alert>
      <div style={{ marginTop: "1.5rem" }}>
        <Button onClick={reset}>Try again</Button>
      </div>
    </>
  );
}
