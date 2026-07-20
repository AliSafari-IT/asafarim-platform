"use client";

import { useTranslation } from "@asafarim/shared-i18n";
import type { TrendRun } from "../_data/types";
import styles from "./testora.module.css";

const W = 640;
const H = 260;
const PAD = { top: 20, right: 20, bottom: 44, left: 40 };

function points(runs: TrendRun[], pick: (r: TrendRun) => number): string {
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const stepX = runs.length > 1 ? innerW / (runs.length - 1) : 0;
  return runs
    .map((r, i) => {
      const x = PAD.left + i * stepX;
      const y = PAD.top + innerH * (1 - pick(r) / 100);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/**
 * Deterministic pure-SVG trend of detection rate and pass rate across the
 * committed fixture runs. No JS, no libraries — renders identically every time.
 */
export function TrendChart({ runs }: { runs: TrendRun[] }) {
  const { t } = useTranslation();
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const stepX = runs.length > 1 ? innerW / (runs.length - 1) : 0;
  const gridY = [0, 25, 50, 75, 100];

  return (
    <div>
      <div className={styles.chartWrap}>
        <svg
          className={styles.chart}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={t("showcase.testora.trend.chart.aria")}
        >
          {/* gridlines + Y labels */}
          {gridY.map((g) => {
            const y = PAD.top + innerH * (1 - g / 100);
            return (
              <g key={g}>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={y}
                  y2={y}
                  stroke="var(--line)"
                  strokeWidth={1}
                />
                <text
                  x={PAD.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="var(--muted)"
                >
                  {g}
                </text>
              </g>
            );
          })}

          {/* X labels (run ref) */}
          {runs.map((r, i) => (
            <text
              key={r.runId}
              x={PAD.left + i * stepX}
              y={H - PAD.bottom + 20}
              textAnchor="middle"
              fontSize="10"
              fill="var(--muted)"
            >
              {r.ref.replace(/^main@/, "")}
            </text>
          ))}

          {/* pass rate line (neutral) */}
          <polyline
            fill="none"
            stroke="var(--muted)"
            strokeWidth={2}
            strokeDasharray="4 4"
            points={points(runs, (r) => r.passRate)}
          />
          {/* detection rate line (accent) */}
          <polyline
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2.5}
            points={points(runs, (r) => r.detectionRate)}
          />
          {runs.map((r, i) => {
            const x = PAD.left + i * stepX;
            const y = PAD.top + innerH * (1 - r.detectionRate / 100);
            return (
              <circle key={r.runId} cx={x} cy={y} r={3.5} fill="var(--accent)" />
            );
          })}
        </svg>
      </div>
      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span
            className={styles.swatch}
            style={{ background: "var(--accent)" }}
          />
          {t("showcase.testora.trend.chart.legend.detection")}
        </span>
        <span className={styles.legendItem}>
          <span
            className={styles.swatch}
            style={{ background: "var(--muted)" }}
          />
          {t("showcase.testora.trend.chart.legend.passRate")}
        </span>
      </div>
    </div>
  );
}
