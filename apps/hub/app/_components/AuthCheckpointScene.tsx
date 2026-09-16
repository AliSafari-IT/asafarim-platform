import styles from "./auth-checkpoint-scene.module.css";

export type AuthCheckpointState = "idle" | "checking" | "success" | "error";

export interface AuthCheckpointSceneProps {
  state?: AuthCheckpointState;
  className?: string;
}

/**
 * Decorative authentication metaphor for the Hub sign-in screen.
 *
 * The ambient timeline is entirely CSS-driven. `state` adds a live signal
 * from the real sign-in flow without participating in authentication itself.
 * The tuning variables live at the top of the companion CSS module.
 */
export function AuthCheckpointScene({
  state = "idle",
  className,
}: AuthCheckpointSceneProps) {
  return (
    <div
      className={`${styles.scene}${className ? ` ${className}` : ""}`}
      data-auth-state={state}
      aria-hidden="true"
    >
      <svg
        className={styles.svg}
        viewBox="0 0 1200 520"
        preserveAspectRatio="xMidYMid slice"
        focusable="false"
      >
        <defs>
          <linearGradient id="checkpoint-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--checkpoint-sky-top)" />
            <stop offset="1" stopColor="var(--checkpoint-sky-bottom)" />
          </linearGradient>
          <linearGradient id="checkpoint-road" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--checkpoint-road)" />
            <stop offset="1" stopColor="var(--checkpoint-road-edge)" />
          </linearGradient>
          <radialGradient id="checkpoint-glow">
            <stop offset="0" stopColor="var(--accent)" stopOpacity=".2" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
          <filter
            id="checkpoint-soft-glow"
            x="-100%"
            y="-100%"
            width="300%"
            height="300%"
          >
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <pattern
            id="checkpoint-grid"
            width="48"
            height="48"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 48 0 L 0 0 0 48"
              fill="none"
              stroke="var(--checkpoint-grid)"
              strokeWidth="1"
            />
          </pattern>
        </defs>

        <rect width="1200" height="520" fill="url(#checkpoint-sky)" />
        <rect
          width="1200"
          height="520"
          fill="url(#checkpoint-grid)"
          opacity=".5"
        />
        <ellipse
          className={styles.horizonGlow}
          cx="610"
          cy="338"
          rx="310"
          ry="160"
          fill="url(#checkpoint-glow)"
        />

        <g className={styles.hillsFar}>
          <path d="M0 330 C125 246 230 272 345 330 S550 370 680 282 S935 228 1200 322 V520 H0Z" />
        </g>
        <g className={styles.hillsNear}>
          <path d="M0 383 C120 302 205 427 338 350 S505 310 612 365 C722 423 803 303 920 346 S1085 398 1200 330 V520 H0Z" />
        </g>

        <path
          className={styles.roadShadow}
          d="M-30 390 C118 304 211 431 342 354 S505 314 612 368 C720 422 805 307 921 349 S1088 401 1230 331"
        />
        <path
          className={styles.road}
          d="M-30 382 C118 296 211 423 342 346 S505 306 612 360 C720 414 805 299 921 341 S1088 393 1230 323"
        />
        <path
          className={styles.laneMarks}
          d="M-30 382 C118 296 211 423 342 346 S505 306 612 360 C720 414 805 299 921 341 S1088 393 1230 323"
        />

        <g className={styles.checkpoint}>
          <ellipse
            className={styles.checkpointAura}
            cx="615"
            cy="330"
            rx="112"
            ry="64"
          />
          <path className={styles.postShadow} d="M655 230v151" />
          <rect
            className={styles.post}
            x="642"
            y="224"
            width="26"
            height="158"
            rx="7"
          />
          <rect
            className={styles.postPanel}
            x="648"
            y="238"
            width="14"
            height="34"
            rx="4"
          />
          <circle className={styles.statusIdle} cx="655" cy="247" r="3.5" />
          <circle className={styles.statusSuccess} cx="655" cy="261" r="3.5" />

          <g className={styles.scanner}>
            <rect x="568" y="293" width="46" height="54" rx="8" />
            <path d="M578 307h26M578 314h18" />
            <rect
              className={styles.scanWindow}
              x="575"
              y="322"
              width="32"
              height="15"
              rx="4"
            />
            <path className={styles.scanLine} d="M580 326h22" />
          </g>

          <g className={styles.barrier}>
            <rect
              className={styles.barrierArm}
              x="655"
              y="282"
              width="122"
              height="11"
              rx="5.5"
            />
            <path
              className={styles.barrierStripe}
              d="M674 282v11m24-11v11m24-11v11m24-11v11"
            />
          </g>

          <g className={styles.successMark}>
            <circle cx="614" cy="268" r="22" />
            <path d="m603 268 7 7 14-16" />
          </g>
          <g className={styles.errorMark}>
            <circle cx="614" cy="268" r="22" />
            <path d="m606 260 16 16m0-16-16 16" />
          </g>
        </g>

        <g className={styles.car}>
          <ellipse className={styles.carShadow} cx="0" cy="19" rx="37" ry="8" />
          <path
            className={styles.carBody}
            d="M-40 4h8l10-17h31L24 4h12c6 0 9 4 9 10v7h-90v-8c0-5 2-9 5-9Z"
          />
          <path className={styles.carWindow} d="m-16-9-8 13H5L1-9Z" />
          <path className={styles.carWindow} d="m6-9 5 13h9L9-9Z" />
          <path className={styles.carTrim} d="M-30 8h62" />
          <circle className={styles.wheel} cx="-25" cy="20" r="9" />
          <circle className={styles.wheelHub} cx="-25" cy="20" r="3" />
          <circle className={styles.wheel} cx="27" cy="20" r="9" />
          <circle className={styles.wheelHub} cx="27" cy="20" r="3" />
          <circle className={styles.headlight} cx="38" cy="9" r="3" />
        </g>

        <g className={styles.credential}>
          <rect x="531" y="300" width="28" height="20" rx="4" />
          <circle cx="538" cy="307" r="2.5" />
          <path d="M544 306h9m-9 5h7" />
        </g>
      </svg>
    </div>
  );
}
