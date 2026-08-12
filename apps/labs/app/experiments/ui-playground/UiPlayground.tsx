"use client";

import { useState } from "react";
import { Badge, Button } from "@asafarim/ui";

const VIEWPORTS = [
  { label: "375px", width: 375 },
  { label: "768px", width: 768 },
  { label: "1200px", width: 1200 },
];

const PSEUDO_STATES = ["default", "hover", "focus", "disabled", "loading"] as const;

export function UiPlayground() {
  const [viewport, setViewport] = useState(VIEWPORTS[2]);
  const [pseudo, setPseudo] = useState<(typeof PSEUDO_STATES)[number]>("default");

  return (
    <div>
      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <div>
          <div className="labs-mono" style={{ fontSize: "0.7rem", opacity: 0.6 }}>
            Viewport
          </div>
          {VIEWPORTS.map((v) => (
            <button
              key={v.label}
              type="button"
              onClick={() => setViewport(v)}
              className="labs-mono"
              style={{ fontWeight: viewport.label === v.label ? 700 : 400, marginRight: "0.5rem" }}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div>
          <div className="labs-mono" style={{ fontSize: "0.7rem", opacity: 0.6 }}>
            Pseudo-state
          </div>
          {PSEUDO_STATES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setPseudo(s)}
              className="labs-mono"
              style={{ fontWeight: pseudo === s ? 700 : 400, marginRight: "0.5rem" }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          width: Math.min(viewport.width, 640),
          margin: "0 auto",
          border: "1px dashed currentColor",
          borderRadius: 8,
          padding: "1.5rem",
        }}
        className={`labs-force-${pseudo}`}
      >
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <Button disabled={pseudo === "disabled"}>Primary</Button>
          <Button variant="secondary" disabled={pseudo === "disabled"}>
            Secondary
          </Button>
          <Badge tone="success">success</Badge>
          <Badge tone="warning">warning</Badge>
          <Badge tone="danger">danger</Badge>
        </div>
        <input placeholder="Text input" disabled={pseudo === "disabled"} style={{ width: "100%" }} />
        <p style={{ fontSize: "0.85rem", opacity: 0.7, marginTop: "0.75rem" }}>
          Simulated state: <strong>{pseudo}</strong> at {viewport.label}.
        </p>
      </div>
    </div>
  );
}
