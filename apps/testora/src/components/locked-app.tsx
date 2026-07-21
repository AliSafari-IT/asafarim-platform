"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useRun } from "@/components/run-provider";

/**
 * Shown in place of an app's data when the active app is private and this browser
 * hasn't unlocked it. Submitting the correct key sets the server-side unlock
 * cookie, then a refresh re-renders the page with the now-visible data.
 */
export function LockedApp({ projectId, name }: { projectId: string; name: string }) {
  const router = useRouter();
  // The Run page gates on the client-side project registry (activeProject.locked),
  // not a server render — so router.refresh() alone leaves it locked until a full
  // reload. Re-fetch /api/projects so the context picks up the now-unlocked state.
  const { refreshProjects } = useRun();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unlock() {
    if (!key.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/projects/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: projectId, key }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError((data?.error as string) || "Could not unlock");
        return;
      }
      setKey("");
      await refreshProjects();
      router.refresh();
    } catch {
      setError("Could not unlock");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="mx-auto mt-10 w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-amber-400" />
            “{name}” is private
          </CardTitle>
          <CardDescription>
            Enter this app&apos;s key to view its requirements, suites, fixtures, cases and
            results. Access stays unlocked on this browser for about 7 days.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <input
            type="password"
            autoFocus
            value={key}
            onChange={(event) => setKey(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void unlock();
            }}
            placeholder="App key"
            disabled={busy}
            className="h-10 w-full rounded-md border border-border bg-muted px-3 text-sm text-foreground"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={() => void unlock()} disabled={busy || !key.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            Unlock
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
