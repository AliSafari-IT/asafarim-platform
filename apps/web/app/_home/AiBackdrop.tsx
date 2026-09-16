import styles from "../page.module.css";

/**
 * Decorative "neural network" backdrop for the hero: pulsing nodes joined by
 * animated edges, plus a handful of drifting particles. Pure CSS/SVG (no JS),
 * so it renders on the server and costs nothing beyond paint. Animations are
 * muted to a crawl (not disabled) under prefers-reduced-motion via CSS.
 */
const NODES: { x: number; y: number; r: number; delay: number }[] = [
  { x: 8, y: 32, r: 0.9, delay: 0 },
  { x: 22, y: 55, r: 0.7, delay: 0.4 },
  { x: 16, y: 74, r: 0.8, delay: 1.1 },
  { x: 38, y: 28, r: 0.7, delay: 0.8 },
  { x: 46, y: 48, r: 1, delay: 0.2 },
  { x: 40, y: 66, r: 0.7, delay: 1.6 },
  { x: 64, y: 34, r: 0.8, delay: 0.6 },
  { x: 58, y: 56, r: 0.7, delay: 1.3 },
  { x: 72, y: 72, r: 0.9, delay: 0.9 },
  { x: 84, y: 30, r: 0.7, delay: 1.8 },
  { x: 90, y: 50, r: 0.85, delay: 0.3 },
  { x: 80, y: 64, r: 0.7, delay: 1.1 },
];

const EDGES: [number, number][] = [
  [0, 1], [1, 2], [1, 3], [1, 4], [3, 4], [4, 5], [4, 6], [4, 7],
  [6, 7], [6, 9], [7, 8], [7, 10], [9, 10], [10, 11], [5, 7],
];

const PARTICLES = Array.from({ length: 10 }, (_, i) => ({
  left: 6 + ((i * 9.3) % 92),
  size: 3 + (i % 3),
  duration: 14 + (i % 5) * 3,
  delay: -(i * 2.1),
}));

export function AiBackdrop() {
  return (
    <div className={styles.aiBackdrop} aria-hidden="true">
      <svg
        className={styles.aiNet}
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="aiEdgeGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--grape)" />
            <stop offset="55%" stopColor="var(--sky)" />
            <stop offset="100%" stopColor="var(--blush)" />
          </linearGradient>
        </defs>
        {EDGES.map(([a, b], i) => (
          <line
            key={`e${i}`}
            className={styles.aiEdge}
            x1={NODES[a].x}
            y1={NODES[a].y}
            x2={NODES[b].x}
            y2={NODES[b].y}
            stroke="url(#aiEdgeGrad)"
            style={{ animationDelay: `${(i % 6) * 0.5}s` }}
          />
        ))}
        {NODES.map((n, i) => (
          <circle
            key={`n${i}`}
            className={styles.aiNode}
            cx={n.x}
            cy={n.y}
            r={n.r}
            style={{ animationDelay: `${n.delay}s` }}
          />
        ))}
      </svg>

      <div className={styles.aiParticles}>
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className={styles.aiParticle}
            style={{
              left: `${p.left}%`,
              width: p.size,
              height: p.size,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
