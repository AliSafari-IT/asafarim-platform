/**
 * The landing hero's scene: a zigzag timeline being built on a canvas, an
 * AI suggestion waiting for Accept/Reject, and export badges. Pure inline
 * SVG whose paint comes from `.hp-art__*` classes in globals.css, so it
 * follows the light/dark tokens. Decorative — the page says all of it in
 * text too.
 */

const NODES = [
  { x: 118, month: "JAN", up: true, w: 78 },
  { x: 204, month: "MAR", up: false, w: 70 },
  { x: 290, month: "JUN", up: true, w: 84, hot: true },
  { x: 376, month: "SEP", up: false, w: 74 },
  { x: 452, month: "DEC", up: true, w: 66 },
];

const AXIS_Y = 262;

export function HeroScene() {
  return (
    <svg className="hp-art" viewBox="0 0 560 470" aria-hidden="true">
      <defs>
        <pattern id="hp-dots" width="18" height="18" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.4" className="hp-art__dot" />
        </pattern>
        <linearGradient id="hp-axis" x1="0" x2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>

      {/* Backdrop */}
      <rect x="30" y="40" width="510" height="400" rx="36" className="hp-art__panel" />
      <rect x="360" y="330" width="170" height="100" fill="url(#hp-dots)" />
      <circle cx="96" cy="96" r="64" className="hp-art__halo" />

      {/* Canvas card */}
      <g className="hp-float hp-float--slow">
        <rect x="62" y="104" width="446" height="270" rx="20" className="hp-art__card hp-art__card--front" />
        <rect x="82" y="124" width="120" height="10" rx="5" className="hp-art__ink" />
        <rect x="82" y="142" width="80" height="7" rx="3.5" className="hp-art__line" />
        {/* layout switcher chips */}
        <rect x="392" y="120" width="96" height="28" rx="14" className="hp-art__chip-bg" />
        <rect x="397" y="124" width="30" height="20" rx="10" className="hp-art__accent" />
        <path d="M405 134h14M408 130h8M408 138h8" strokeWidth="1.6" strokeLinecap="round" className="hp-art__on-accent-stroke" />
        <path d="M437 134h14M444 129v10" strokeWidth="1.6" strokeLinecap="round" className="hp-art__muted-stroke" />
        <circle cx="474" cy="134" r="6" fill="none" strokeWidth="1.6" className="hp-art__muted-stroke" />

        {/* axis, drawn in */}
        <line x1="96" y1={AXIS_Y} x2="476" y2={AXIS_Y} strokeWidth="4" strokeLinecap="round" className="hp-art__track" />
        <line
          x1="96"
          y1={AXIS_Y}
          x2="476"
          y2={AXIS_Y}
          stroke="url(#hp-axis)"
          strokeWidth="4"
          strokeLinecap="round"
          pathLength={1}
          className="hp-art__draw"
        />

        {NODES.map((n, i) => {
          const cardY = n.up ? AXIS_Y - 86 : AXIS_Y + 24;
          const stemFrom = n.up ? AXIS_Y - 10 : AXIS_Y + 10;
          const stemTo = n.up ? cardY + 50 : cardY;
          return (
            <g key={n.month} className="hp-pop" style={{ animationDelay: `${0.5 + i * 0.18}s` }}>
              <line x1={n.x} y1={stemFrom} x2={n.x} y2={stemTo} strokeWidth="2" strokeDasharray="3 4" className="hp-art__muted-stroke" />
              <rect
                x={n.x - n.w / 2}
                y={cardY}
                width={n.w}
                height="50"
                rx="10"
                className={n.hot ? "hp-art__card hp-art__card--hot" : "hp-art__card"}
              />
              <rect x={n.x - n.w / 2 + 10} y={cardY + 13} width={n.w - 26} height="7" rx="3.5" className={n.hot ? "hp-art__accent" : "hp-art__ink"} />
              <rect x={n.x - n.w / 2 + 10} y={cardY + 27} width={n.w - 34} height="5" rx="2.5" className="hp-art__line" />
              <circle cx={n.x} cy={AXIS_Y} r={n.hot ? 10 : 8} className={n.hot ? "hp-art__warm" : "hp-art__node"} />
              <text x={n.x} y={n.up ? AXIS_Y + 26 : AXIS_Y - 17} textAnchor="middle" className="hp-art__month">
                {n.month}
              </text>
            </g>
          );
        })}
      </g>

      {/* AI suggestion bubble */}
      <g className="hp-float hp-float--delay">
        <rect x="330" y="30" width="200" height="98" rx="18" className="hp-art__card hp-art__card--front" />
        <circle cx="354" cy="56" r="12" className="hp-art__accent-soft" />
        <path d="M354 48.5 355.6 54l5.4 1.6-5.4 1.6-1.6 5.3-1.6-5.3-5.4-1.6 5.4-1.6 1.6-5.5Z" className="hp-art__accent" />
        <text x="374" y="53" className="hp-art__title">AI suggests</text>
        <text x="374" y="67" className="hp-art__sub">“Beta launch” · Jun</text>
        <rect x="346" y="84" width="76" height="28" rx="14" className="hp-art__accent" />
        <text x="384" y="102" textAnchor="middle" className="hp-art__btn-text">Accept</text>
        <rect x="430" y="84" width="84" height="28" rx="14" className="hp-art__chip-bg" />
        <text x="472" y="102" textAnchor="middle" className="hp-art__btn-text hp-art__btn-text--muted">Reject</text>
        {/* cursor */}
        <path d="M398 104l0 22 6-6 5 10 4-2-5-10 8-1Z" className="hp-art__cursor" strokeWidth="1.5" strokeLinejoin="round" />
      </g>

      {/* Gantt chip */}
      <g className="hp-float">
        <rect x="20" y="304" width="138" height="92" rx="18" className="hp-art__card hp-art__card--front" />
        <text x="38" y="328" className="hp-art__label">GANTT</text>
        <rect x="38" y="340" width="70" height="10" rx="5" className="hp-art__accent" />
        <rect x="62" y="356" width="72" height="10" rx="5" className="hp-art__warm" />
        <rect x="88" y="372" width="52" height="10" rx="5" className="hp-art__accent-soft-strong" />
      </g>

      {/* Export badges */}
      <g className="hp-float hp-float--slow">
        <rect x="416" y="376" width="62" height="74" rx="14" className="hp-art__card hp-art__card--front" />
        <text x="447" y="410" textAnchor="middle" className="hp-art__file">PNG</text>
        <rect x="462" y="360" width="62" height="74" rx="14" className="hp-art__warm" />
        <text x="493" y="394" textAnchor="middle" className="hp-art__file hp-art__file--on-warm">PDF</text>
        <path d="M493 404v12m-5-5 5 5 5-5" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="hp-art__on-warm-stroke" />
      </g>
    </svg>
  );
}
