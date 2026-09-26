"use client";

import { useState } from "react";
import { useTranslation } from "@asafarim/shared-i18n";

/**
 * The four platform-level protections drawn as rings around the CV they
 * protect, outermost first — the order a request actually passes through
 * them. Picking a layer (click, focus, or hover) lights its ring and shows
 * the detail; the list itself stays readable without the diagram.
 */

/** resumatch.landing.layer<n>.title / .body, outermost ring first. */
const LAYERS = ["layer1", "layer2", "layer3", "layer4"];

/** Outer edge of each ring band; every band is BAND wide. */
const RADII = [150, 120, 90, 60];
const BAND = 28;

export function SecurityLayers() {
  const { t } = useTranslation();
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
          <li key={layer}>
            <button
              type="button"
              className={i === active ? "lp-layer lp-layer--active" : "lp-layer"}
              aria-expanded={i === active}
              onClick={() => setActive(i)}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
            >
              <span className="lp-layer__num">{i + 1}</span>
              <span className="lp-layer__title">{t(`resumatch.landing.${layer}.title`)}</span>
            </button>
            <p className="lp-layer__body" hidden={i !== active}>
              {t(`resumatch.landing.${layer}.body`)}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
