import styles from "./access-map.module.css";

export interface AccessMapNode {
  key: string;
  glyph: string;
  name: string;
  granted: boolean;
  /**
   * Granted, but only as a preview: public pages open, working in the app
   * needs an account. Drawn amber instead of cyan.
   */
  preview?: boolean;
  /** Where a granted node links to (interactive maps only). */
  href?: string;
  description?: string;
  meta?: string;
  /** Optional escape hatch for a locked node — e.g. sign in, then return. */
  lockedHref?: string;
}

/**
 * Animated picture of single sign-on: one identity (the shield) issues a
 * signed token that streams out to every app. Apps the viewer's roles allow
 * light up as the token lands; apps they don't allow reject it — the token
 * is stopped part-way, flashes red and falls back, and the app shows a lock.
 *
 * Pure SVG + SMIL, so it renders on the server with no client JS. The
 * granted/locked split is real (the caller derives it from canAccessApp),
 * which makes this a live access map, not decoration. Motion is dropped
 * under prefers-reduced-motion (see the module CSS).
 */
export function AccessMap({
  nodes,
  centerLabel,
  tokenLabel,
  compact = false,
  interactive = false,
  lockedHint = "Your roles don’t include this app.",
  lockedCta = "Sign in to unlock",
}: {
  nodes: AccessMapNode[];
  /** Short text inside the shield — e.g. the user's initials. */
  centerLabel: string;
  /** Mono caption under the shield — e.g. "roles: admin". */
  tokenLabel: string;
  compact?: boolean;
  /**
   * Overlay each node with a real link + hover card, turning the map into a
   * launcher. The links are HTML anchors positioned over the drawing, so
   * they stay keyboard-focusable and screen-reader friendly.
   */
  interactive?: boolean;
  lockedHint?: string;
  lockedCta?: string;
}) {
  const W = 640;
  const H = compact ? 400 : 380;
  const cx = W / 2;
  const cy = H / 2;
  const rx = compact ? 220 : 248;
  const ry = compact ? 150 : 138;
  const cycle = 3.4;
  const n = Math.max(nodes.length, 1);

  const placed = nodes.map((node, i) => {
    const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const x = cx + rx * Math.cos(angle);
    const y = cy + ry * Math.sin(angle);
    // Bend each link sideways a little so the spokes read as flowing
    // curves rather than a rigid star.
    const dx = x - cx;
    const dy = y - cy;
    const len = Math.hypot(dx, dy) || 1;
    const bend = 26;
    const qx = (cx + x) / 2 + (-dy / len) * bend;
    const qy = (cy + y) / 2 + (dx / len) * bend;
    // Where a rejected token is stopped: 68% along the curve.
    const t = 0.68;
    const stopX = (1 - t) ** 2 * cx + 2 * (1 - t) * t * qx + t ** 2 * x;
    const stopY = (1 - t) ** 2 * cy + 2 * (1 - t) * t * qy + t ** 2 * y;
    const labelBelow = y > cy + 4;
    return {
      ...node,
      x,
      y,
      stopX,
      stopY,
      d: `M${cx} ${cy} Q${qx.toFixed(1)} ${qy.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`,
      begin: `${((i * cycle) / n).toFixed(2)}s`,
      labelY: labelBelow ? y + 34 : y - 27,
    };
  });

  const grantedCount = nodes.filter((node) => node.granted && !node.preview).length;
  const previewCount = nodes.filter((node) => node.granted && node.preview).length;
  const lockedCount = nodes.length - grantedCount - previewCount;
  const label =
    `Access map: ${grantedCount} of ${nodes.length} apps unlocked` +
    (previewCount ? `, ${previewCount} in preview` : "") +
    ` for this identity.`;
  const hoverColor = (p: AccessMapNode) =>
    !p.granted ? "#f43f5e" : p.preview ? "#f59e0b" : "#22d3ee";
  const dur = `${cycle}s`;

  return (
    <figure className={styles.figure} data-am="">
      {interactive && (
        // Per-app hover wiring: hovering/focusing a node's link lights up that
        // node's path and ring in the drawing. Keys are registry ids.
        <style>
          {placed
            .map(
              (p) =>
                `[data-am]:has([data-hot="${p.key}"]:is(:hover,:focus-visible)) [data-link="${p.key}"]{opacity:1;stroke:${hoverColor(p)};stroke-width:2.6;stroke-dasharray:none}` +
                `[data-am]:has([data-hot="${p.key}"]:is(:hover,:focus-visible)) [data-node="${p.key}"]{stroke-width:3.5}`
            )
            .join("")}
        </style>
      )}
      <div className={styles.stage}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={styles.svg}
        role="img"
        aria-label={label}
      >
        <defs>
          <linearGradient id="am-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="50%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
          <radialGradient id="am-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
          </radialGradient>
          <filter id="am-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {placed.map((p) => (
            <path key={p.key} id={`am-p-${p.key}`} d={p.d} />
          ))}
        </defs>

        {/* Links */}
        {placed.map((p) => (
          <path
            key={p.key}
            d={p.d}
            data-link={p.key}
            className={!p.granted ? styles.linkLocked : p.preview ? styles.linkPreview : styles.link}
          />
        ))}

        {/* Core glow + sign-in broadcast pulse */}
        <circle cx={cx} cy={cy} r="90" fill="url(#am-core)" />
        <circle cx={cx} cy={cy} r="40" className={styles.pulse}>
          <animate attributeName="r" values="40;96" dur={dur} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.55;0" dur={dur} repeatCount="indefinite" />
        </circle>

        {/* Orbit rings around the identity */}
        <g className={styles.spin} style={{ transformOrigin: `${cx}px ${cy}px` }}>
          <circle cx={cx} cy={cy} r="58" className={styles.orbit} />
        </g>
        <g className={styles.spinReverse} style={{ transformOrigin: `${cx}px ${cy}px` }}>
          <circle cx={cx} cy={cy} r="70" className={styles.orbitFaint} />
        </g>

        {/* Tokens */}
        {placed.map((p) =>
          p.granted ? (
            <circle
              key={p.key}
              r="4.5"
              className={p.preview ? styles.tokenPreview : styles.token}
              filter="url(#am-glow)"
              opacity="0"
            >
              <animateMotion
                dur={dur}
                begin={p.begin}
                repeatCount="indefinite"
                keyPoints="0;1;1"
                keyTimes="0;0.55;1"
                calcMode="linear"
              >
                <mpath href={`#am-p-${p.key}`} />
              </animateMotion>
              <animate
                attributeName="opacity"
                values="0;1;1;0;0"
                keyTimes="0;0.06;0.5;0.56;1"
                dur={dur}
                begin={p.begin}
                repeatCount="indefinite"
              />
            </circle>
          ) : (
            <circle key={p.key} r="4.5" className={styles.tokenDenied} opacity="0">
              <animateMotion
                dur={dur}
                begin={p.begin}
                repeatCount="indefinite"
                keyPoints="0;0.68;0.68;0.5;0.5"
                keyTimes="0;0.42;0.5;0.62;1"
                calcMode="linear"
              >
                <mpath href={`#am-p-${p.key}`} />
              </animateMotion>
              <animate
                attributeName="opacity"
                values="0;1;1;0;0"
                keyTimes="0;0.06;0.5;0.62;1"
                dur={dur}
                begin={p.begin}
                repeatCount="indefinite"
              />
            </circle>
          )
        )}

        {/* Rejection flashes where locked tokens are stopped */}
        {placed
          .filter((p) => !p.granted)
          .map((p) => (
            <circle key={p.key} cx={p.stopX} cy={p.stopY} r="6" className={styles.deny} opacity="0">
              <animate
                attributeName="r"
                values="4;4;14;14"
                keyTimes="0;0.42;0.58;1"
                dur={dur}
                begin={p.begin}
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0;0;0.9;0;0"
                keyTimes="0;0.41;0.43;0.6;1"
                dur={dur}
                begin={p.begin}
                repeatCount="indefinite"
              />
            </circle>
          ))}

        {/* App nodes */}
        {placed.map((p) => (
          <g key={p.key}>
            {p.granted && (
              <circle
                cx={p.x}
                cy={p.y}
                r="19"
                className={p.preview ? styles.ringPreview : styles.ring}
                opacity="0"
              >
                <animate
                  attributeName="r"
                  values="19;19;32;32"
                  keyTimes="0;0.55;0.85;1"
                  dur={dur}
                  begin={p.begin}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values="0;0;0.9;0;0"
                  keyTimes="0;0.54;0.56;0.85;1"
                  dur={dur}
                  begin={p.begin}
                  repeatCount="indefinite"
                />
              </circle>
            )}
            <circle
              cx={p.x}
              cy={p.y}
              r="19"
              data-node={p.key}
              className={!p.granted ? styles.nodeLocked : p.preview ? styles.nodePreview : styles.node}
            />
            <text x={p.x} y={p.y + 3.5} className={p.granted ? styles.glyph : styles.glyphLocked}>
              {p.glyph}
            </text>
            {p.preview && (
              // Eye badge: you can look around, but not work here yet.
              <g transform={`translate(${p.x + 17} ${p.y - 14})`} className={styles.eye}>
                <circle r="7.5" />
                <path d="M-4.2 0 Q0 -3.6 4.2 0 Q0 3.6 -4.2 0 Z" />
                <circle r="1.3" className={styles.eyePupil} />
              </g>
            )}
            {!p.granted && (
              <g transform={`translate(${p.x + 12} ${p.y - 20})`} className={styles.lock}>
                <rect x="-1" y="4" width="11" height="9" rx="2" />
                <path d="M1.5 4.5 V2.5 a3 3 0 0 1 6 0 V4.5" />
              </g>
            )}
            <text x={p.x} y={p.labelY} className={p.granted ? styles.label : styles.labelLocked}>
              {p.name}
            </text>
          </g>
        ))}

        {/* Identity shield */}
        <g transform={`translate(${cx} ${cy})`}>
          <path
            d="M0 -36 L30 -24 V2 C30 22 16 33 0 40 C-16 33 -30 22 -30 2 V-24 Z"
            className={styles.shield}
          />
          <path
            d="M0 -36 L30 -24 V2 C30 22 16 33 0 40 C-16 33 -30 22 -30 2 V-24 Z"
            fill="none"
            stroke="url(#am-grad)"
            strokeWidth="2.5"
            filter="url(#am-glow)"
          />
          <text y="7" className={styles.center}>
            {centerLabel}
          </text>
        </g>
        <text x={cx} y={cy + 62} className={styles.tokenLabel}>
          {tokenLabel}
        </text>
      </svg>

      {interactive &&
        placed.map((p) => {
          const href = p.granted ? p.href : p.lockedHref;
          const side = p.x < cx - 40 ? "left" : p.x > cx + 40 ? "right" : "center";
          const below = p.y < cy;
          const card = (
            <span className={styles.tip} data-side={side} data-below={below}>
              <span className={styles.tipHead}>
                <span className={p.granted ? styles.tipGlyph : styles.tipGlyphLocked}>{p.glyph}</span>
                <span className={styles.tipName}>{p.name}</span>
                <span className={!p.granted ? styles.tipNo : p.preview ? styles.tipPreview : styles.tipOk}>
                  {!p.granted ? "Locked" : p.preview ? "Preview" : "Unlocked"}
                </span>
              </span>
              {p.description && <span className={styles.tipDesc}>{p.description}</span>}
              {p.preview && (
                <span className={styles.tipNote}>
                  Public pages are open — sign up or sign in to start working in it.
                </span>
              )}
              <span className={styles.tipFoot}>
                {p.preview ? (
                  <>
                    {p.meta && <span className={styles.tipMeta}>{p.meta}</span>}
                    <span className={styles.tipCta}>Explore →</span>
                  </>
                ) : p.granted ? (
                  <>
                    {p.meta && <span className={styles.tipMeta}>{p.meta}</span>}
                    <span className={styles.tipCta}>Open →</span>
                  </>
                ) : p.lockedHref ? (
                  <span className={styles.tipCta}>{lockedCta} →</span>
                ) : (
                  <span className={styles.tipMeta}>{lockedHint}</span>
                )}
              </span>
            </span>
          );
          const style = {
            left: `${((p.x / W) * 100).toFixed(2)}%`,
            top: `${((p.y / H) * 100).toFixed(2)}%`,
          };
          return href ? (
            <a
              key={p.key}
              href={href}
              data-hot={p.key}
              className={
                !p.granted
                  ? `${styles.hot} ${styles.hotLocked}`
                  : p.preview
                    ? `${styles.hot} ${styles.hotPreview}`
                    : styles.hot
              }
              style={style}
              aria-label={
                !p.granted
                  ? `${p.name} is locked — ${lockedCta}`
                  : p.preview
                    ? `Explore ${p.name} (preview — an account is needed to work in it)`
                    : `Open ${p.name}`
              }
            >
              {card}
            </a>
          ) : (
            <span
              key={p.key}
              data-hot={p.key}
              className={`${styles.hot} ${styles.hotLocked}`}
              style={style}
              tabIndex={0}
              role="img"
              aria-label={`${p.name} is locked. ${lockedHint}`}
            >
              {card}
            </span>
          );
        })}
      </div>

      <figcaption className={styles.legend}>
        <span>
          <i className={styles.dotOn} /> {grantedCount} unlocked
        </span>
        {previewCount > 0 && (
          <span>
            <i className={styles.dotPreview} /> {previewCount} preview
          </span>
        )}
        <span>
          <i className={styles.dotOff} /> {lockedCount} locked
        </span>
      </figcaption>
    </figure>
  );
}
