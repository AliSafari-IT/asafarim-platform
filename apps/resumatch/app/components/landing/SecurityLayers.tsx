"use client";

import { useState } from "react";

/**
 * The four platform-level protections drawn as rings around the CV they
 * protect, outermost first — the order a request actually passes through
 * them. Picking a layer (click, focus, or hover) lights its ring and shows
 * the detail; the list itself stays readable without the diagram.
 */

const LAYERS = [
  {
    title: "Deny-by-default routing",
    body: "Only the landing and legal pages are public. Every other surface requires a session, checked again at the data boundary.",
  },
  {
    title: "Shared sign-in",
    body: "Hub issues the session, ResuMatch only reads it. There is no second password to manage or leak.",
  },
  {
    title: "Redacted observability",
    body: "Every log line and audit row passes an allow-list. CV text and job-page content cannot reach a log sink by accident.",
  },
  {
    title: "Isolated database",
    body: "Its own PostgreSQL instance and credentials. It stores an opaque platform user id and never copies the platform user table.",
  },
];

/** Outer edge of each ring band; every band is BAND wide. */
const RADII = [150, 120, 90, 60];
const BAND = 28;

export function SecurityLayers() {
  const [active, setActive] = useState(0);

  return (
    <div className="lp-layers">
      <svg className="lp-layers__rings" viewBox="0 0 340 340" aria-hidden="true">
        {RADII.map((r, i) => (
          <circle
            key={r}
            cx="170"
            cy="170"
            r={r - BAND / 2}
            strokeWidth={BAND}
            className={i === active ? "lp-ring lp-ring--active" : "lp-ring"}
            style={{ ["--i" as string]: i }}
            onMouseEnter={() => setActive(i)}
          />
        ))}
        <circle cx="170" cy="170" r="34" className="lp-ring__core" />
        <path
          d="M160 154h14l8 8v22a3 3 0 0 1-3 3h-19a3 3 0 0 1-3-3v-27a3 3 0 0 1 3-3Z"
          className="lp-ring__doc"
        />
        <rect x="162" y="168" width="14" height="3" rx="1.5" className="lp-ring__doc-line" />
        <rect x="162" y="175" width="10" height="3" rx="1.5" className="lp-ring__doc-line" />
        {RADII.map((r, i) => (
          <text key={r} x="170" y={170 - r + 19} textAnchor="middle" className="lp-ring__num">
            {i + 1}
          </text>
        ))}
      </svg>

      <ol className="lp-layers__list">
        {LAYERS.map((layer, i) => (
          <li key={layer.title}>
            <button
              type="button"
              className={i === active ? "lp-layer lp-layer--active" : "lp-layer"}
              aria-expanded={i === active}
              onClick={() => setActive(i)}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
            >
              <span className="lp-layer__num">{i + 1}</span>
              <span className="lp-layer__title">{layer.title}</span>
            </button>
            <p className="lp-layer__body" hidden={i !== active}>
              {layer.body}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
