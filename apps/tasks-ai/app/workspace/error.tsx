"use client";

import { useEffect } from "react";
import { Button } from "@asafarim/ui";

/**
 * Render-time error boundary for /workspace (issue #363). Next.js already
 * turns an uncaught Server Component exception into a normal HTTP 500 —
 * this only improves what the *browser* shows for that response, it does
 * not paper over a genuinely unhealthy deployment. If workspace lookups are
 * failing because the database is unreachable, this boundary still renders
 * (the failure already happened server-side); the fix is the underlying
 * cause, not this page.
 */
export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server-side, this already reached the platform's request logs with a
    // stack trace; this client-side log is for whoever has devtools open.
    console.error("[workspace] failed to load:", error);
  }, [error]);

  return (
    <main className="ta-prose">
      <p className="ta-kicker">Workspaces</p>
      <h1>Something went wrong</h1>
      <p>
        We couldn&apos;t load your workspaces just now. This is usually temporary — try again in a
        moment.
      </p>
      <Button type="button" onClick={() => reset()}>
        Try again
      </Button>
    </main>
  );
}
