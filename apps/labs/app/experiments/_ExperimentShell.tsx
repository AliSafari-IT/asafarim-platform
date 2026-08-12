"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Badge } from "@asafarim/ui";
import type { Experiment } from "../../lib/experiments/registry";

export function ExperimentShell({
  experiment,
  canvas,
  controls,
}: {
  experiment: Experiment;
  canvas: ReactNode;
  controls?: ReactNode;
}) {
  const [resetKey, setResetKey] = useState(0);

  return (
    <div key={resetKey}>
      <div className="labs-shell-header">
        <div>
          <div className="labs-mono" style={{ fontSize: "0.75rem", opacity: 0.7 }}>
            <Link href="/experiments">Labs</Link> / {experiment.title}
          </div>
          <h1 style={{ margin: "0.3rem 0" }}>{experiment.title}</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Badge>{experiment.status}</Badge>
          <span className="labs-mono" style={{ fontSize: "0.75rem", opacity: 0.7 }}>
            v{experiment.version}
          </span>
          <button
            type="button"
            className="labs-mono"
            onClick={() => setResetKey((k) => k + 1)}
            style={{ fontSize: "0.75rem" }}
          >
            ↺ Reset
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: controls ? "1fr 260px" : "1fr", gap: "1rem" }}>
        <div className="labs-canvas">{canvas}</div>
        {controls ? <aside className="labs-drawer">{controls}</aside> : null}
      </div>

      <div style={{ marginTop: "2rem" }}>
        <details className="labs-accordion">
          <summary>How it works</summary>
          <p>{experiment.description}</p>
        </details>
        <details className="labs-accordion">
          <summary>Known limitations &amp; edge cases</summary>
          <ul>
            {experiment.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </details>
        <details className="labs-accordion">
          <summary>Telemetry &amp; privacy notice</summary>
          <p>
            This experiment collects no analytics and stores nothing server-side. Any state you
            see lives in this browser tab only (memory or <code>localStorage</code>) and clears on
            reset or reload.
          </p>
        </details>
        <details className="labs-accordion">
          <summary>Feedback</summary>
          <p>
            Spotted something broken? Open an issue on the{" "}
            <a href="https://github.com/AliSafari-IT/asafarim-platform/issues" target="_blank" rel="noreferrer">
              asafarim-platform repo
            </a>{" "}
            with the experiment slug (<code>{experiment.slug}</code>) in the title.
          </p>
        </details>
      </div>
    </div>
  );
}
