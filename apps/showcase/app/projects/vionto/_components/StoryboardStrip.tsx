import styles from "./vionto.module.css";

interface RenderShotReport {
  shotIndex: number;
  assetId: string;
  kind: string;
  durationSeconds: number;
  frameCount: number;
}
interface RenderReport {
  shots: RenderShotReport[];
}

const W = 140;
const H = 90;
const GAP = 10;

/**
 * A deterministic storyboard strip built from the fixture render report —
 * one labelled rect per shot. Reconstructed as JSX (not injected raw SVG
 * markup) even though the harness's `buildStoryboardSvg` produces an
 * equivalent string — the same rendering logic, just expressed as React
 * elements from trusted, committed data.
 */
export function StoryboardStrip({ report }: { report: RenderReport }) {
  const totalWidth = report.shots.length * (W + GAP) - GAP;
  return (
    <div className={styles.strip}>
      <svg
        className={styles.stripSvg}
        viewBox={`0 0 ${totalWidth} ${H}`}
        role="img"
        aria-label="Storyboard strip"
      >
        {report.shots.map((shot, i) => {
          const x = i * (W + GAP);
          const hue = (i * 47) % 360;
          return (
            <g key={shot.shotIndex}>
              <rect
                x={x}
                y={0}
                width={W}
                height={H}
                rx={8}
                fill={`hsl(${hue} 45% 22%)`}
                stroke={`hsl(${hue} 45% 45%)`}
              />
              <text x={x + 10} y={20} fontSize="11" fill="#e6edf3" fontFamily="ui-monospace, monospace">
                Shot {shot.shotIndex + 1}
              </text>
              <text x={x + 10} y={38} fontSize="10" fill="#8b98a5" fontFamily="ui-monospace, monospace">
                {shot.kind}
              </text>
              <text x={x + 10} y={74} fontSize="10" fill="#8b98a5" fontFamily="ui-monospace, monospace">
                {shot.durationSeconds}s · {shot.frameCount}f
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
