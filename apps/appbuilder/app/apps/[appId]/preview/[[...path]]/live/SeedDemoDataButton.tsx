"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@asafarim/ui";
import { seedDemoData } from "./apiClient";
import { LiveApiError } from "./types";

/** Builder-only affordance shown when there's no generated-app data yet — calls the same M09 `seed-reset` endpoint the M08/M09 seed mechanism already exposes (bootstraps the owner as admin + inserts deterministic task-management demo records), then reloads so the live view picks up the new membership. */
export function SeedDemoDataButton({ appId }: { appId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      await seedDemoData(appId);
      router.refresh();
    } catch (err) {
      setError(err instanceof LiveApiError ? err.message : "Failed to seed demo data.");
      setBusy(false);
    }
  }

  return (
    <div>
      <Button type="button" onClick={handleClick} disabled={busy}>
        {busy ? "Seeding…" : "Seed demo data"}
      </Button>
      {error ? (
        <p className="ui-field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
