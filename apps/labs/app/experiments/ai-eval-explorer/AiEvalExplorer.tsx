"use client";

import evalRuns from "../../../fixtures/eval-runs.json";

type EvalRun = {
  model: string;
  latencyMs: number;
  tokensPerDollar: number;
  hallucinationMarkers: number;
  formattingAdherence: number;
};

const runs = evalRuns as EvalRun[];

export function AiEvalExplorer() {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="labs-mono" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid currentColor" }}>
            <th style={{ padding: "0.4rem" }}>Model</th>
            <th style={{ padding: "0.4rem" }}>Latency (ms)</th>
            <th style={{ padding: "0.4rem" }}>Tokens / $</th>
            <th style={{ padding: "0.4rem" }}>Hallucination markers</th>
            <th style={{ padding: "0.4rem" }}>Formatting adherence</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.model} style={{ borderBottom: "1px solid color-mix(in srgb, currentColor 15%, transparent)" }}>
              <td style={{ padding: "0.4rem", fontWeight: 700 }}>{run.model}</td>
              <td style={{ padding: "0.4rem" }}>{run.latencyMs}</td>
              <td style={{ padding: "0.4rem" }}>{run.tokensPerDollar.toLocaleString()}</td>
              <td style={{ padding: "0.4rem" }}>{run.hallucinationMarkers}</td>
              <td style={{ padding: "0.4rem" }}>{Math.round(run.formattingAdherence * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: "0.75rem", opacity: 0.6, marginTop: "0.75rem" }}>
        Static fixture snapshot from <code>fixtures/eval-runs.json</code> — not live model calls.
      </p>
    </div>
  );
}
