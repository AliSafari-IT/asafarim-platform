"use client";

import { useEffect } from "react";
import { Alert, Button } from "@asafarim/ui";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Alert tone="error">
      <strong>Something went wrong.</strong>
      <p>{error.message || "An unexpected error occurred."}</p>
      <Button variant="secondary" size="sm" onClick={reset}>
        Try again
      </Button>
    </Alert>
  );
}
