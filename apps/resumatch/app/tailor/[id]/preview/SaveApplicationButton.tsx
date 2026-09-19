"use client";

import { useState } from "react";
import { Button } from "@asafarim/ui";

/** Ties a tailored resume to the application tracker (#432) — POSTs
 *  /api/applications with this resume's job and id, so the candidate can
 *  follow up on it later without retyping anything. */
export function SaveApplicationButton({ targetJobId, tailoredResumeId }: { targetJobId: string; tailoredResumeId: string }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save() {
    setState("saving");
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetJobId, tailoredResumeId }),
      });
      setState(res.ok ? "saved" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "saved") return <span style={{ fontSize: "0.85rem", opacity: 0.75 }}>Saved to applications</span>;

  return (
    <Button variant="ghost" onClick={save} disabled={state === "saving"}>
      {state === "saving" ? "Saving…" : state === "error" ? "Could not save — try again" : "Save to applications"}
    </Button>
  );
}
