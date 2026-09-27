import styles from "./workbench.module.css";

const STEPS = [
  { title: "Browser", body: "Visitor pastes text or loads the example" },
  { title: "Admission", body: "Same-origin JSON, size caps, rate limits, daily budget" },
  { title: "Adapter", body: "Versioned input schema; text split into numbered sources" },
  { title: "Fixture or AI", body: "Deterministic fixture, or the AI provider behind the eval gate" },
  { title: "Server checks", body: "Output schema + domain rules drop unsupported claims" },
  { title: "Review", body: "Labelled items, edit, select, conflicts, undo" },
  { title: "Export / handoff", body: "Markdown, JSON, or a file the destination app validates again" },
];

/**
 * Request flow shared by all three tools. An SVG for sighted users with a
 * text equivalent (the ordered list) for everyone else.
 */
export function FlowDiagram() {
  const w = 150;
  const gap = 18;
  return (
    <figure className={styles.figure}>
      <svg viewBox={`0 0 ${STEPS.length * (w + gap) - gap} 96`} className={styles.diagram} role="img" aria-labelledby="flow-title flow-desc">
        <title id="flow-title">AI Workbench request flow</title>
        <desc id="flow-desc">{STEPS.map((s, i) => `${i + 1}. ${s.title}: ${s.body}`).join(" ")}</desc>
        {STEPS.map((s, i) => {
          const x = i * (w + gap);
          return (
            <g key={s.title}>
              <rect x={x} y={8} width={w} height={80} rx={8} className={i === 4 ? styles.nodeStrong : styles.node} />
              <text x={x + w / 2} y={40} textAnchor="middle" className={styles.nodeTitle}>
                {s.title}
              </text>
              <text x={x + w / 2} y={62} textAnchor="middle" className={styles.nodeStep}>
                step {i + 1}
              </text>
              {i < STEPS.length - 1 ? <path d={`M${x + w + 2} 48 l${gap - 6} 0`} className={styles.arrow} markerEnd="url(#arrowhead)" /> : null}
            </g>
          );
        })}
        <defs>
          <marker id="arrowhead" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0 0 L8 4 L0 8 z" className={styles.arrowHead} />
          </marker>
        </defs>
      </svg>
      <figcaption>
        <ol className={styles.flowList}>
          {STEPS.map((s) => (
            <li key={s.title}>
              <strong>{s.title}.</strong> {s.body}
            </li>
          ))}
        </ol>
      </figcaption>
    </figure>
  );
}
