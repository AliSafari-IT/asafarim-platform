"use client";

import { useState } from "react";
import { api } from "../lib/client/api";

/**
 * Inline "was this useful?" for an M08 risk/workload signal. Verdict is
 * tied to the signal's ruleVersion so a later rule change stays
 * attributable (see docs/intelligence.md).
 */
export function SignalFeedback({
  slug,
  signalType,
  ruleVersion,
  targetId,
}: {
  slug: string;
  signalType: string;
  ruleVersion: string;
  targetId: string;
}) {
  const [sent, setSent] = useState<string | null>(null);

  async function send(verdict: string) {
    setSent(verdict);
    await api
      .signalFeedback(slug, {
        signalType,
        targetType: "task",
        targetId,
        verdict,
        ruleVersion,
      })
      .catch(() => setSent(null));
  }

  if (sent) return <p className="ta-muted ta-signals__fb">Thanks — recorded ({sent.replace("_", " ")}).</p>;
  return (
    <p className="ta-signals__fb">
      <button className="ta-linkbtn" onClick={() => send("helpful")}>
        Helpful
      </button>
      {" · "}
      <button className="ta-linkbtn" onClick={() => send("false_alarm")}>
        False alarm
      </button>
      {" · "}
      <button className="ta-linkbtn" onClick={() => send("wrong_evidence")}>
        Wrong evidence
      </button>
    </p>
  );
}
