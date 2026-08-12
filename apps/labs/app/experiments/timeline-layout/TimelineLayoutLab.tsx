"use client";

import { useState } from "react";

type Layout = "vertical" | "horizontal" | "roadmap" | "story";
type TimelineEvent = { id: string; label: string; date: string };

const SEED: TimelineEvent[] = [
  { id: "1", label: "Idea captured", date: "2026-01-10" },
  { id: "2", label: "Prototype built", date: "2026-03-02" },
  { id: "3", label: "Promoted to Showcase", date: "2026-06-18" },
];

export function TimelineLayoutLab() {
  const [events, setEvents] = useState<TimelineEvent[]>(SEED);
  const [layout, setLayout] = useState<Layout>("vertical");
  const [label, setLabel] = useState("");

  function addEvent() {
    if (!label.trim()) return;
    setEvents((prev) => [
      ...prev,
      { id: crypto.randomUUID(), label: label.trim(), date: new Date().toISOString().slice(0, 10) },
    ]);
    setLabel("");
  }

  return (
    <div>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        {(["vertical", "horizontal", "roadmap", "story"] as Layout[]).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLayout(l)}
            className="labs-mono"
            style={{ fontWeight: layout === l ? 700 : 400 }}
          >
            {l}
          </button>
        ))}
      </div>

      {layout === "vertical" && (
        <ol style={{ borderLeft: "2px solid var(--labs-accent)", paddingLeft: "1rem" }}>
          {events.map((e) => (
            <li key={e.id} style={{ marginBottom: "0.75rem" }}>
              <span className="labs-mono" style={{ opacity: 0.6 }}>
                {e.date}
              </span>{" "}
              — {e.label}
            </li>
          ))}
        </ol>
      )}

      {layout === "horizontal" && (
        <div style={{ display: "flex", gap: "1.5rem", overflowX: "auto", paddingBottom: "0.5rem" }}>
          {events.map((e) => (
            <div key={e.id} style={{ minWidth: 140, borderTop: "2px solid var(--labs-accent)", paddingTop: "0.5rem" }}>
              <div className="labs-mono" style={{ fontSize: "0.75rem", opacity: 0.6 }}>
                {e.date}
              </div>
              <div>{e.label}</div>
            </div>
          ))}
        </div>
      )}

      {layout === "roadmap" && (
        <div>
          {events.map((e, i) => (
            <div key={e.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
              <span className="labs-mono" style={{ width: 90, fontSize: "0.75rem", opacity: 0.6 }}>
                {e.date}
              </span>
              <div
                style={{
                  height: 10,
                  background: "var(--labs-accent)",
                  width: `${40 + i * 60}px`,
                  borderRadius: 4,
                }}
              />
              <span style={{ fontSize: "0.85rem" }}>{e.label}</span>
            </div>
          ))}
        </div>
      )}

      {layout === "story" && (
        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
          {events.map((e) => (
            <div key={e.id} className="labs-drawer">
              <div className="labs-mono" style={{ fontSize: "0.7rem", opacity: 0.6 }}>
                {e.date}
              </div>
              <p style={{ margin: "0.4rem 0 0" }}>{e.label}</p>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.5rem" }}>
        <input
          value={label}
          onChange={(ev) => setLabel(ev.target.value)}
          placeholder="New event label"
          style={{ flex: 1 }}
        />
        <button type="button" onClick={addEvent}>
          Add event
        </button>
      </div>
    </div>
  );
}
