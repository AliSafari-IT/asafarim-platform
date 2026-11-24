"use client";

import { useState } from "react";
import type { ActivitySeries } from "../../../lib/activity/dailySeries";

/**
 * Several daily series as grouped bars, with a legend whose items toggle
 * each series (issue #943). Same drawing space and accessibility as
 * `ActivityBars`: `summary` is the chart's accessible name, every bar has a
 * native <title>, and the toggles are real buttons with aria-pressed.
 * Colours come from CSS (`rx-chart__bar--<key>`), never from this file.
 */
export function ActivitySeriesChart({
  days,
  series,
  summary,
  legendLabel,
}: {
  days: string[];
  series: ActivitySeries[];
  summary: string;
  legendLabel: string;
}) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const shown = series.filter((s) => !hidden.has(s.key) && s.total > 0);

  const W = 1000;
  const H = 110;
  const pad = 18;
  const max = Math.max(1, ...shown.flatMap((s) => s.counts));
  const slot = (W - pad * 2) / Math.max(days.length, 1);
  const groupW = Math.min(Math.max(slot - 10, 4), 34 * Math.max(shown.length, 1));
  const gap = shown.length > 1 ? 2 : 0;
  const barW = shown.length > 0 ? (groupW - gap * (shown.length - 1)) / shown.length : groupW;
  // Two-digit labels need ~12px; below that the hover title carries the value.
  const showValues = barW >= 12;

  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <figure className="rx-chart">
      <div className="rx-chart__legend" role="group" aria-label={legendLabel}>
        {series.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`rx-chart__legend-item rx-chart__legend-item--${s.key}`}
            aria-pressed={!hidden.has(s.key)}
            onClick={() => toggle(s.key)}
          >
            <span className="rx-chart__swatch" aria-hidden="true" />
            <span>{s.label}</span>
            <span className="rx-chart__legend-total">{s.total}</span>
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H + 22}`} className="rx-chart__svg" role="img" aria-label={summary}>
        <line x1={pad} y1={H} x2={W - pad} y2={H} className="rx-chart__base" />
        {days.map((day, i) => {
          const groupX = pad + i * slot + (slot - groupW) / 2;
          const empty = shown.every((s) => s.counts[i] === 0);
          return (
            <g key={day}>
              {empty ? (
                <rect x={groupX} y={H - 3} width={groupW} height={3} rx={2} className="rx-chart__bar rx-chart__bar--zero">
                  <title>{`${day}: 0`}</title>
                </rect>
              ) : (
                shown.map((s, j) => {
                  const count = s.counts[i] ?? 0;
                  if (count === 0) return null;
                  const h = Math.max((count / max) * (H - 16), 6);
                  const x = groupX + j * (barW + gap);
                  return (
                    <g key={s.key}>
                      <rect
                        x={x}
                        y={H - h}
                        width={barW}
                        height={h}
                        rx={Math.min(4, barW / 3)}
                        className={`rx-chart__bar rx-chart__bar--${s.key}`}
                      >
                        <title>{`${day} · ${s.label}: ${count}`}</title>
                      </rect>
                      {showValues ? (
                        <text
                          x={x + barW / 2}
                          y={H - h - 4}
                          textAnchor="middle"
                          className={shown.length > 1 ? "rx-chart__value rx-chart__value--small" : "rx-chart__value"}
                        >
                          {count}
                        </text>
                      ) : null}
                    </g>
                  );
                })
              )}
              {i === 0 || i === days.length - 1 || i === Math.floor(days.length / 2) ? (
                <text x={groupX + groupW / 2} y={H + 16} textAnchor="middle" className="rx-chart__axis">
                  {day.slice(5)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
